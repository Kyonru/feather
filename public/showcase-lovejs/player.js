(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  document.body.appendChild(canvas);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let payload = { tool: 'idle' };
  let tick = 0;
  let shaderProgram = null;
  let shaderError = null;
  let shaderSourceKey = '';
  let quadBuffer = null;
  let quadBufferKey = '';
  let textureProgram = null;
  let whiteTexture = null;
  let previewTexture = null;
  let previewTextureKey = '';
  let textureCacheKey = '';
  let textureCache = new Map();

  const VERT_SRC = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
varying vec2 v_screenCoord;
uniform vec2 u_resolution;
void main() {
  v_texCoord = a_texCoord;
  v_screenCoord = (a_position * 0.5 + 0.5) * u_resolution;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`.trim();

  const TEXTURE_FRAG_SRC = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_texCoord);
}
`.trim();

  function resize() {
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(window.innerWidth * scale));
    const height = Math.max(1, Math.floor(window.innerHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  function adaptLoveShader(lovePixel) {
    const srcText = String(lovePixel || '');
    const sig = srcText.match(
      /vec4\s+effect\s*\(\s*vec4\s+(\w+)\s*,\s*(?:Image|sampler2D)\s+(\w+)\s*,\s*vec2\s+(\w+)\s*,\s*vec2\s+(\w+)\s*\)/,
    );
    const colorP = sig?.[1] || 'color';
    const texP = sig?.[2] || 'tex_param';
    const uvP = sig?.[3] || 'texture_coords';
    const screenP = sig?.[4] || 'screen_coords';
    let src = srcText;
    src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?Image\s+/g, 'uniform $1sampler2D ');
    src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?number\s+/g, 'uniform $1float ');
    src = src.replace(/\bextern\s+/g, 'uniform ');
    src = src.replace(/\bTexel\s*\(/g, 'texture2D(');
    src = src.replace(
      /\bvec4\s+effect\s*\([^)]+\)\s*\{/,
      `vec4 feather_effect(vec4 ${colorP}, sampler2D ${texP}, vec2 ${uvP}, vec2 ${screenP}) {`,
    );
    return [
      'precision mediump float;',
      'varying vec2 v_texCoord;',
      'varying vec2 v_screenCoord;',
      'uniform sampler2D u_tex;',
      'uniform vec4 u_color;',
      'uniform vec2 u_resolution;',
      'uniform vec4 love_ScreenSize;',
      '',
      src,
      '',
      'void main() {',
      '  gl_FragColor = feather_effect(u_color, u_tex, v_texCoord, v_screenCoord);',
      '}',
    ].join('\n');
  }

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Shader compile failed';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function linkProgram(fragmentSrc) {
    const vert = compile(gl.VERTEX_SHADER, VERT_SRC);
    const frag = compile(gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Shader link failed';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  function ensureQuadBuffer(width, height) {
    const zoom = Math.max(0.4, Math.min(2.5, Number(payload.previewZoom) || 1));
    const size = Math.max(32, Math.min(width, height) * 0.62 * zoom);
    const x = size / width;
    const y = size / height;
    const key = `${width}:${height}:${size}`;
    if (!quadBuffer) quadBuffer = gl.createBuffer();
    if (quadBufferKey === key) return quadBuffer;
    quadBufferKey = key;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -x, -y, 0, 1,
        x, -y, 1, 1,
        -x, y, 0, 0,
        x, y, 1, 0,
      ]),
      gl.DYNAMIC_DRAW,
    );
    return quadBuffer;
  }

  function bindQuad(program, width, height) {
    const buffer = ensureQuadBuffer(width, height);
    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (aPosition >= 0) {
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    }
    if (aTexCoord >= 0) {
      gl.enableVertexAttribArray(aTexCoord);
      gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);
    }
  }

  function ensureWhiteTexture() {
    if (whiteTexture) return whiteTexture;
    whiteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return whiteTexture;
  }

  function makeShapeCanvas() {
    const surface = document.createElement('canvas');
    surface.width = 256;
    surface.height = 256;
    const ctx = surface.getContext('2d');
    const shape = payload.previewShape || 'circle';
    const color = Array.isArray(payload.previewColor)
      ? `rgba(${Math.round((Number(payload.previewColor[0]) || 0) * 255)}, ${Math.round((Number(payload.previewColor[1]) || 0) * 255)}, ${Math.round((Number(payload.previewColor[2]) || 0) * 255)}, ${Number(payload.previewColor[3] ?? 1)})`
      : String(payload.previewColor || '#ffffff');
    const pad = 56;
    ctx.clearRect(0, 0, surface.width, surface.height);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    if (shape === 'rectangle') {
      ctx.fillRect(pad, pad, surface.width - pad * 2, surface.height - pad * 2);
    } else if (shape === 'line') {
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(pad, surface.height - pad);
      ctx.lineTo(surface.width - pad, pad);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(surface.width / 2, surface.height / 2, 78, 0, Math.PI * 2);
      ctx.fill();
    }
    return surface;
  }

  function configureTexture(texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function uploadTextureSource(source) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  function ensurePreviewTexture() {
    const base = payload.baseTexture;
    const key = base?.dataBase64
      ? `base:${base.filename || ''}:${base.dataBase64.length}`
      : `shape:${payload.previewShape || 'circle'}:${JSON.stringify(payload.previewColor || '#ffffff')}`;
    if (previewTexture && previewTextureKey === key) return previewTexture;
    if (previewTexture) gl.deleteTexture(previewTexture);
    previewTexture = gl.createTexture();
    previewTextureKey = key;
    configureTexture(previewTexture);

    if (base?.dataBase64) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      const image = new Image();
      image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, previewTexture);
        uploadTextureSource(image);
      };
      image.src = `data:image/png;base64,${base.dataBase64}`;
      return previewTexture;
    }

    uploadTextureSource(makeShapeCanvas());
    return previewTexture;
  }

  function ensureShaderProgram() {
    const pixel = String(payload.pixel || '');
    const key = pixel;
    if (!pixel) return null;
    if (shaderProgram && shaderSourceKey === key) return shaderProgram;
    if (shaderProgram) gl.deleteProgram(shaderProgram);
    shaderProgram = null;
    shaderSourceKey = key;
    shaderError = null;
    try {
      shaderProgram = linkProgram(adaptLoveShader(pixel));
    } catch (error) {
      shaderError = error instanceof Error ? error.message : String(error);
    }
    return shaderProgram;
  }

  function ensureTextureProgram() {
    if (textureProgram) return textureProgram;
    try {
      textureProgram = linkProgram(TEXTURE_FRAG_SRC);
    } catch (error) {
      shaderError = error instanceof Error ? error.message : String(error);
    }
    return textureProgram;
  }

  function rgbaFromHex(hex) {
    if (Array.isArray(hex)) {
      const values = hex.map(Number);
      return [values[0] || 0, values[1] || 0, values[2] || 0, values[3] ?? 1];
    }
    const clean = String(hex || '#ffffff').replace(/^#/, '');
    if (clean.length < 6) return [1, 1, 1, 1];
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
      1,
    ];
  }

  function valueArray(value, fallback) {
    return Array.isArray(value) ? value.map(Number) : fallback;
  }

  function setParameterUniforms(program) {
    const parameters = Array.isArray(payload.parameters) ? payload.parameters : [];
    parameters.forEach((parameter) => {
      if (!parameter || parameter.type === 'texture' || !parameter.uniform) return;
      const location = gl.getUniformLocation(program, parameter.uniform);
      if (!location) return;
      const value = parameter.defaultValue;
      if (parameter.type === 'float') gl.uniform1f(location, Number(value) || 0);
      else if (parameter.type === 'vec2') gl.uniform2fv(location, valueArray(value, [0, 0]).slice(0, 2));
      else if (parameter.type === 'vec3') gl.uniform3fv(location, valueArray(value, [0, 0, 0]).slice(0, 3));
      else if (parameter.type === 'vec4' || parameter.type === 'color') gl.uniform4fv(location, valueArray(value, [0, 0, 0, 1]).slice(0, 4));
    });
  }

  function refreshUploadedTextures() {
    const uploads = Array.isArray(payload.textures) ? payload.textures : [];
    const key = JSON.stringify(uploads.map((upload) => [upload.uniform, upload.filename, upload.dataBase64?.length || 0]));
    if (key === textureCacheKey) return;
    textureCache.forEach((texture) => gl.deleteTexture(texture));
    textureCache = new Map();
    textureCacheKey = key;
    uploads.forEach((upload) => {
      if (!upload?.uniform || !upload.dataBase64) return;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const image = new Image();
      image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        uploadTextureSource(image);
      };
      image.src = `data:image/png;base64,${upload.dataBase64}`;
      textureCache.set(upload.uniform, texture);
    });
  }

  function bindTextures(program) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ensurePreviewTexture() || ensureWhiteTexture());
    const uTex = gl.getUniformLocation(program, 'u_tex');
    if (uTex) gl.uniform1i(uTex, 0);
    refreshUploadedTextures();
    let unit = 1;
    textureCache.forEach((texture, uniform) => {
      const location = gl.getUniformLocation(program, uniform);
      if (!location || unit >= 8) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location, unit);
      unit += 1;
    });
  }

  function drawPreviewSurface(width, height) {
    const program = ensureTextureProgram();
    if (!program) return;
    gl.useProgram(program);
    bindQuad(program, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ensurePreviewTexture() || ensureWhiteTexture());
    const uTex = gl.getUniformLocation(program, 'u_tex');
    if (uTex) gl.uniform1i(uTex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawShader(width, height) {
    const program = ensureShaderProgram();
    if (!program) {
      drawPreviewSurface(width, height);
      return;
    }

    gl.useProgram(program);
    bindQuad(program, width, height);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uLoveScreenSize = gl.getUniformLocation(program, 'love_ScreenSize');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uColor = gl.getUniformLocation(program, 'u_color');
    if (uResolution) gl.uniform2f(uResolution, width, height);
    if (uLoveScreenSize) gl.uniform4f(uLoveScreenSize, width, height, 1 / Math.max(1, width), 1 / Math.max(1, height));
    if (uTime) gl.uniform1f(uTime, tick * 0.001);
    if (uColor) gl.uniform4fv(uColor, rgbaFromHex(payload.previewColor));
    bindTextures(program);
    setParameterUniforms(program);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function draw() {
    tick += 16;
    resize();
    if (!gl) {
      requestAnimationFrame(draw);
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (payload.tool === 'shader-graph') drawShader(width, height);
    else drawPreviewSurface(width, height);
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'feather-showcase' || event.data?.type !== 'preview:update') return;
    payload = event.data.payload || payload;
    shaderError = null;
  });

  resize();
  draw();
})();
