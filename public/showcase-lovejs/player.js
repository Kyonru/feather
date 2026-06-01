/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */
(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  document.body.appendChild(canvas);
  const derivativeExtension = gl?.getExtension('OES_standard_derivatives') || null;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let payload = { tool: 'idle' };
  window._featherPayload = payload;
  let tick = 0;
  let shaderProgram = null;
  let shaderError = null;
  let shaderSourceKey = '';
  let quadBuffer = null;
  let quadBufferKey = '';
  let textureProgram = null;
  let particleProgram = null;
  let particleBuffer = null;
  let particlePayloadKey = '';
  let particleTimelineTime = 0;
  let particleTimelinePlaying = false;
  let particleLastScrubVersion = -1;
  let particleSystems = [];
  let whiteTexture = null;
  let previewTexture = null;
  let previewTextureKey = '';
  let previewTextureSize = { width: 256, height: 256 };
  let textureCacheKey = '';
  let textureCache = new Map();

  const statusOverlay = document.createElement('div');
  statusOverlay.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'bottom:0',
    'display:none',
    'padding:6px 8px',
    'background:rgba(127,29,29,0.94)',
    'color:white',
    'font:11px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
    'line-height:1.35',
    'pointer-events:none',
    'z-index:1000',
    'white-space:pre-wrap',
  ].join(';');
  document.body.appendChild(statusOverlay);

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

  const PARTICLE_VERT_SRC = `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
varying vec4 v_color;
uniform vec2 u_resolution;
void main() {
  vec2 clip = vec2((a_position.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (a_position.y / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}
`.trim();

  const PARTICLE_FRAG_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 delta = gl_PointCoord - vec2(0.5);
  float dist = length(delta);
  float alpha = smoothstep(0.5, 0.28, dist);
  gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
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
    src = src.replace(/\bextern\s+(?:(?:lowp|mediump|highp)\s+)?bool\s+/g, 'uniform bool ');
    src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?int\s+/g, 'uniform $1int ');
    src = src.replace(/\bextern\s+/g, 'uniform ');
    src = src.replace(/\bImage\b/g, 'sampler2D');
    src = src.replace(/\bTexel\s*\(/g, 'texture2D(');
    src = src.replace(
      /\bvec4\s+effect\s*\([^)]+\)\s*\{/,
      `vec4 feather_effect(vec4 ${colorP}, sampler2D ${texP}, vec2 ${uvP}, vec2 ${screenP}) {`,
    );
    const derivativeHeader = loveShaderUsesDerivatives(srcText)
      ? ['#extension GL_OES_standard_derivatives : enable']
      : [];
    return [
      ...derivativeHeader,
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

  function loveShaderUsesDerivatives(source) {
    return /\b(?:dFdx|dFdy|fwidth)\s*\(/.test(String(source || ''));
  }

  function updateShaderStatus() {
    const status = {
      error: shaderError || '',
      hasProgram: Boolean(shaderProgram),
      shader: Boolean(shaderProgram),
      drawable: Boolean(previewTexture || whiteTexture),
      textureCount: textureCache.size,
      sourceKey: shaderSourceKey,
    };
    window._featherShaderPreviewStatus = status;
    if (shaderError) {
      statusOverlay.textContent = `Shader preview error:\n${shaderError}`;
      statusOverlay.style.display = 'block';
    } else {
      statusOverlay.style.display = 'none';
    }
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
    const maxExtent = Math.max(32, Math.min(width, height) * 0.62 * zoom);
    const textureWidth = Math.max(1, Number(previewTextureSize.width) || 1);
    const textureHeight = Math.max(1, Number(previewTextureSize.height) || 1);
    const textureAspect = textureWidth / textureHeight;
    const drawWidth = textureAspect >= 1 ? maxExtent : maxExtent * textureAspect;
    const drawHeight = textureAspect >= 1 ? maxExtent / textureAspect : maxExtent;
    const x = drawWidth / width;
    const y = drawHeight / height;
    const key = `${width}:${height}:${drawWidth}:${drawHeight}`;
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

  function uploadFingerprint(upload) {
    const data = uploadData(upload);
    return `${upload?.filename || ''}:${data.length}:${data.slice(0, 16)}:${data.slice(-16)}`;
  }

  function uploadData(upload) {
    if (upload?.dataBase64) return String(upload.dataBase64);
    if (!upload?.dataKey || !upload?.dataLength) return '';
    const cache = window._featherUploadCache || window.parent?.__featherPreviewUploadCache || null;
    return cache?.[String(upload.dataKey)] || '';
  }

  function hasUploadData(upload) {
    return uploadData(upload).length > 0;
  }

  function mimeFromFilename(filename) {
    const lower = String(filename || '').toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  function dataUrlForUpload(upload) {
    return `data:${mimeFromFilename(upload?.filename)};base64,${uploadData(upload)}`;
  }

  function ensurePreviewTexture() {
    const base = payload.baseTexture;
    const key = hasUploadData(base)
      ? `base:${uploadFingerprint(base)}`
      : `shape:${payload.previewShape || 'circle'}:${JSON.stringify(payload.previewColor || '#ffffff')}`;
    if (previewTexture && previewTextureKey === key) return previewTexture;
    if (previewTexture) gl.deleteTexture(previewTexture);
    previewTexture = gl.createTexture();
    previewTextureKey = key;
    previewTextureSize = { width: 256, height: 256 };
    quadBufferKey = '';
    configureTexture(previewTexture);

    if (hasUploadData(base)) {
      previewTextureSize = { width: 1, height: 1 };
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      const image = new Image();
      image.onload = () => {
        if (previewTextureKey !== key) return;
        gl.bindTexture(gl.TEXTURE_2D, previewTexture);
        previewTextureSize = { width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 };
        quadBufferKey = '';
        uploadTextureSource(image);
      };
      image.onerror = () => {
        if (previewTextureKey !== key) return;
        gl.bindTexture(gl.TEXTURE_2D, previewTexture);
        previewTextureSize = { width: 256, height: 256 };
        quadBufferKey = '';
        uploadTextureSource(makeShapeCanvas());
        shaderError = `Could not load preview texture${base?.filename ? `: ${base.filename}` : ''}.`;
        updateShaderStatus();
      };
      image.src = dataUrlForUpload(base);
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
    if (loveShaderUsesDerivatives(pixel) && !derivativeExtension) {
      shaderError = 'This browser WebGL preview does not expose OES_standard_derivatives, required by dFdx/dFdy/fwidth nodes.';
      updateShaderStatus();
      return null;
    }
    try {
      shaderProgram = linkProgram(adaptLoveShader(pixel));
    } catch (error) {
      shaderError = error instanceof Error ? error.message : String(error);
    }
    updateShaderStatus();
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

  function ensureParticleProgram() {
    if (particleProgram) return particleProgram;
    try {
      const vert = compile(gl.VERTEX_SHADER, PARTICLE_VERT_SRC);
      const frag = compile(gl.FRAGMENT_SHADER, PARTICLE_FRAG_SRC);
      particleProgram = gl.createProgram();
      gl.attachShader(particleProgram, vert);
      gl.attachShader(particleProgram, frag);
      gl.linkProgram(particleProgram);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(particleProgram, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(particleProgram) || 'Particle preview link failed';
        gl.deleteProgram(particleProgram);
        particleProgram = null;
        throw new Error(message);
      }
    } catch (error) {
      shaderError = error instanceof Error ? error.message : String(error);
    }
    return particleProgram;
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

  function parseCsvNumbers(value, fallback = []) {
    if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
    const values = String(value || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter(Number.isFinite);
    return values.length > 0 ? values : fallback;
  }

  function safeNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function interpolate(a, b, t) {
    return a + (b - a) * t;
  }

  function colorStops(value) {
    const values = parseCsvNumbers(value, [1, 1, 1, 1, 1, 1, 1, 0]);
    const first = [values[0] ?? 1, values[1] ?? 1, values[2] ?? 1, values[3] ?? 1];
    const lastIndex = Math.max(0, Math.floor(values.length / 4) - 1) * 4;
    const last = [
      values[lastIndex] ?? first[0],
      values[lastIndex + 1] ?? first[1],
      values[lastIndex + 2] ?? first[2],
      values[lastIndex + 3] ?? first[3],
    ];
    return { first, last };
  }

  function sizeStops(value) {
    const values = parseCsvNumbers(value, [1, 0]);
    return [values[0] ?? 1, values[Math.max(0, values.length - 1)] ?? values[0] ?? 1];
  }

  function sortedKeyframes(points) {
    return Array.isArray(points)
      ? [...points]
          .map((point) => ({ time: safeNumber(point?.time, 0), value: safeNumber(point?.value, 0) }))
          .sort((a, b) => a.time - b.time)
      : [];
  }

  function evaluateKeyframes(points, time, fallback) {
    const keyframes = sortedKeyframes(points);
    if (keyframes.length === 0) return fallback;
    if (time <= keyframes[0].time) return keyframes[0].value;
    for (let i = 0; i < keyframes.length - 1; i += 1) {
      const current = keyframes[i];
      const next = keyframes[i + 1];
      if (time >= current.time && time <= next.time) {
        const span = Math.max(0.0001, next.time - current.time);
        return interpolate(current.value, next.value, Math.max(0, Math.min(1, (time - current.time) / span)));
      }
    }
    return keyframes[keyframes.length - 1].value;
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
    const key = JSON.stringify(uploads.map((upload) => [upload.uniform, uploadFingerprint(upload)]));
    if (key === textureCacheKey) return;
    textureCache.forEach((texture) => gl.deleteTexture(texture));
    textureCache = new Map();
    textureCacheKey = key;
    uploads.forEach((upload) => {
      if (!upload?.uniform || !hasUploadData(upload)) return;
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
        updateShaderStatus();
      };
      image.onerror = () => {
        shaderError = `Could not load texture uniform ${upload.uniform}${upload.filename ? ` (${upload.filename})` : ''}.`;
        updateShaderStatus();
      };
      image.src = dataUrlForUpload(upload);
      textureCache.set(upload.uniform, texture);
    });
    updateShaderStatus();
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
      updateShaderStatus();
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
    updateShaderStatus();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function particlePayloadSignature(composite) {
    if (!composite) return '';
    const systems = Array.isArray(composite.systems) ? composite.systems : [];
    return JSON.stringify({
      activeComposite: payload.activeComposite,
      previewEnabled: composite.previewEnabled !== false,
      x: composite.x,
      y: composite.y,
      movement: composite.movement,
      timeline: composite.timeline,
      systems: systems.map((system) => ({
        index: system.index,
        enabled: system.enabled,
        x: system.x,
        y: system.y,
        blendMode: system.blendMode,
        emitAtStart: system.emitAtStart,
        properties: system.properties,
      })),
    });
  }

  function rebuildParticleSystems(width, height) {
    const composite = payload.composite || {};
    const systems = Array.isArray(composite.systems) ? composite.systems : [];
    particleSystems = systems.map((system) => {
      const props = system.properties || {};
      const colors = colorStops(props.colors);
      const sizes = sizeStops(props.sizes);
      return {
        index: safeNumber(system.index, 1),
        enabled: system.enabled !== false,
        blendMode: String(system.blendMode || 'alpha'),
        x: safeNumber(system.x, 0),
        y: safeNumber(system.y, 0),
        emitAtStart: Math.max(0, safeNumber(system.emitAtStart, 0)),
        emissionRate: Math.max(0, safeNumber(props.emissionRate, 80)),
        particleLifetimeMin: Math.max(0.05, safeNumber(props.particleLifetimeMin, 0.35)),
        particleLifetimeMax: Math.max(0.05, safeNumber(props.particleLifetimeMax, 1.2)),
        direction: safeNumber(props.direction, -Math.PI / 2),
        spread: Math.max(0, safeNumber(props.spread, Math.PI / 3)),
        speedMin: safeNumber(props.speedMin, 40),
        speedMax: safeNumber(props.speedMax, 140),
        accelXMin: safeNumber(props.linearAccelXMin, 0),
        accelXMax: safeNumber(props.linearAccelXMax, 0),
        accelYMin: safeNumber(props.linearAccelYMin, 0),
        accelYMax: safeNumber(props.linearAccelYMax, 0),
        sizeStart: Math.max(0.05, sizes[0]),
        sizeEnd: Math.max(0, sizes[1]),
        colorStart: colors.first,
        colorEnd: colors.last,
        opacity: 1,
        baseEmissionRate: Math.max(0, safeNumber(props.emissionRate, 80)),
        baseEmitterLifetime: safeNumber(props.emitterLifetime, -1),
        baseSpeedMin: safeNumber(props.speedMin, 40),
        baseSpeedMax: safeNumber(props.speedMax, 140),
        baseSizeStart: Math.max(0.05, sizes[0]),
        baseSizeEnd: Math.max(0, sizes[1]),
        baseDirection: safeNumber(props.direction, -Math.PI / 2),
        baseSpread: Math.max(0, safeNumber(props.spread, Math.PI / 3)),
        baseX: safeNumber(system.x, 0),
        baseY: safeNumber(system.y, 0),
        particles: [],
        emitAccumulator: 0,
        lastTimelineTime: 0,
      };
    });

    const state = composite.timelineState || {};
    particleTimelineTime = Math.max(0, safeNumber(state.time, 0));
    particleTimelinePlaying = state.playing === true;
    particleLastScrubVersion = safeNumber(state.scrubVersion, -1);
    if (composite.timeline) emitTimelineBursts(-0.0001, particleTimelineTime, width, height);
    else {
      particleSystems.forEach((system) => {
        emitParticles(system, Math.min(80, Math.max(0, system.emitAtStart)), width, height);
      });
    }
  }

  function ensureParticleSystems(width, height) {
    const composite = payload.composite;
    const key = particlePayloadSignature(composite);
    if (key === particlePayloadKey) return;
    particlePayloadKey = key;
    rebuildParticleSystems(width, height);
  }

  function particleTrackFor(systemIndex) {
    const timeline = payload.composite?.timeline;
    const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
    return tracks.find((track) => safeNumber(track.systemIndex, -1) === systemIndex);
  }

  function particleTimelineMode(timeline) {
    const mode = timeline?.mode;
    if (mode === 'one-shot' || mode === 'loop' || mode === 'ambient') return mode;
    return timeline?.loop ? 'loop' : 'one-shot';
  }

  function particleCanEmit(system, time) {
    const timeline = payload.composite?.timeline;
    if (!timeline || !Array.isArray(timeline.tracks)) return true;
    const mode = particleTimelineMode(timeline);
    const track = particleTrackFor(system.index);
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    return clips.some((clip) => {
      const start = safeNumber(clip.start, 0);
      const stop = safeNumber(clip.end, 0);
      const lifetime = safeNumber(system.baseEmitterLifetime, -1);
      if (mode === 'ambient' && lifetime < 0) return time >= start;
      const lifetimeStop = lifetime < 0 ? stop : Math.min(stop, start + lifetime);
      return time >= start && time <= lifetimeStop;
    });
  }

  function emitTimelineBursts(previous, nextTime, width, height) {
    const timeline = payload.composite?.timeline;
    if (!timeline || !Array.isArray(timeline.tracks)) return;
    particleSystems.forEach((system) => {
      const track = particleTrackFor(system.index);
      const clips = Array.isArray(track?.clips) ? track.clips : [];
      clips.forEach((clip) => {
        const start = safeNumber(clip.start, 0);
        if (start > previous && start <= nextTime) {
          emitParticles(system, Math.max(0, safeNumber(clip.emit, system.emitAtStart)), width, height);
        }
      });
    });
  }

  function particleOrigin(system, width, height) {
    const composite = payload.composite || {};
    const baseX = width * 0.5 + (safeNumber(composite.x, 400) - 400) * (width / 800);
    const baseY = height * 0.56 + (safeNumber(composite.y, 300) - 300) * (height / 600);
    return {
      x: baseX + system.x * (width / 800),
      y: baseY + system.y * (height / 600),
    };
  }

  function applyParticleTimelineAt(time) {
    const timeline = payload.composite?.timeline;
    particleSystems.forEach((system) => {
      system.emissionRate = system.baseEmissionRate;
      system.speedMin = system.baseSpeedMin;
      system.speedMax = system.baseSpeedMax;
      system.sizeStart = system.baseSizeStart;
      system.sizeEnd = system.baseSizeEnd;
      system.direction = system.baseDirection;
      system.spread = system.baseSpread;
      system.x = system.baseX;
      system.y = system.baseY;
      system.opacity = 1;
      if (!timeline || !Array.isArray(timeline.tracks)) return;
      const track = particleTrackFor(system.index);
      const lanes = track?.lanes || {};
      system.opacity = evaluateKeyframes(lanes.opacity, time, 1);
      system.emissionRate = Math.max(0, evaluateKeyframes(lanes.emissionRate, time, system.baseEmissionRate));
      const speedScale = Math.max(0, evaluateKeyframes(lanes.speedScale, time, 1));
      system.speedMin = system.baseSpeedMin * speedScale;
      system.speedMax = system.baseSpeedMax * speedScale;
      const sizeScale = Math.max(0, evaluateKeyframes(lanes.sizeScale, time, 1));
      system.sizeStart = system.baseSizeStart * sizeScale;
      system.sizeEnd = system.baseSizeEnd * sizeScale;
      system.direction = evaluateKeyframes(lanes.direction, time, system.baseDirection);
      system.spread = Math.max(0, evaluateKeyframes(lanes.spread, time, system.baseSpread));
      system.x = evaluateKeyframes(lanes.offsetX, time, system.baseX);
      system.y = evaluateKeyframes(lanes.offsetY, time, system.baseY);
    });
  }

  function emitParticles(system, count, width, height) {
    if (!system.enabled || count <= 0) return;
    const origin = particleOrigin(system, width, height);
    const maxCount = 900;
    for (let i = 0; i < count; i += 1) {
      const life = interpolate(system.particleLifetimeMin, system.particleLifetimeMax, Math.random());
      const speed = interpolate(system.speedMin, system.speedMax, Math.random()) * Math.min(width, height) / 520;
      const angle = system.direction + (Math.random() - 0.5) * system.spread;
      system.particles.push({
        age: 0,
        life,
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: interpolate(system.accelXMin, system.accelXMax, Math.random()) * (width / 800),
        ay: interpolate(system.accelYMin, system.accelYMax, Math.random()) * (height / 600),
        spin: Math.random() * Math.PI * 2,
      });
    }
    if (system.particles.length > maxCount) {
      system.particles.splice(0, system.particles.length - maxCount);
    }
  }

  function updateParticleSystems(dt, width, height) {
    const composite = payload.composite || {};
    if (composite.previewEnabled === false) {
      particleSystems.forEach((system) => {
        system.particles.length = 0;
      });
      return;
    }

    const timeline = composite.timeline;
    const duration = Math.max(0.01, safeNumber(timeline?.duration, 3));
    const incomingState = composite.timelineState || {};
    const incomingTime = Math.max(0, safeNumber(incomingState.time, particleTimelineTime));
    const incomingPlaying = incomingState.playing === true;
    const wasPlaying = particleTimelinePlaying;
    const scrubVersion = safeNumber(incomingState.scrubVersion, particleLastScrubVersion);
    const explicitSeek = scrubVersion !== particleLastScrubVersion && !wasPlaying && !incomingPlaying;
    particleTimelinePlaying = incomingPlaying;
    particleLastScrubVersion = scrubVersion;

    if (!particleTimelinePlaying && explicitSeek) {
      particleTimelineTime = Math.min(duration, incomingTime);
      particleSystems.forEach((system) => {
        system.particles.length = 0;
        system.emitAccumulator = 0;
      });
      if (timeline) emitTimelineBursts(-0.0001, particleTimelineTime, width, height);
      else {
        particleSystems.forEach((system) => {
          emitParticles(system, Math.min(60, Math.max(0, system.emitAtStart)), width, height);
        });
      }
    } else if (particleTimelinePlaying) {
      const previous = particleTimelineTime;
      particleTimelineTime += dt;
      if (particleTimelineTime > duration) {
        const mode = particleTimelineMode(timeline);
        if (mode === 'loop') {
          emitTimelineBursts(previous, duration, width, height);
          particleTimelineTime %= duration;
          emitTimelineBursts(0, particleTimelineTime, width, height);
        } else if (mode === 'ambient') {
          emitTimelineBursts(previous, duration, width, height);
          particleTimelineTime = duration;
          particleTimelinePlaying = true;
        } else {
          emitTimelineBursts(previous, duration, width, height);
          particleTimelineTime = duration;
          particleTimelinePlaying = false;
        }
      } else {
        emitTimelineBursts(previous, particleTimelineTime, width, height);
      }
    } else {
      particleTimelineTime = incomingTime;
    }

    applyParticleTimelineAt(particleTimelineTime);

    particleSystems.forEach((system) => {
      const shouldEmit = particleTimelinePlaying ? particleCanEmit(system, particleTimelineTime) : !timeline;
      if (system.enabled && shouldEmit) {
        system.emitAccumulator += system.emissionRate * dt;
        const count = Math.min(80, Math.floor(system.emitAccumulator));
        system.emitAccumulator -= count;
        emitParticles(system, count, width, height);
      }
      system.particles = system.particles.filter((particle) => {
        particle.age += dt;
        if (particle.age >= particle.life) return false;
        particle.vx += particle.ax * dt;
        particle.vy += particle.ay * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        return true;
      });
    });
  }

  function drawParticlePreview(width, height, dt) {
    ensureParticleSystems(width, height);
    updateParticleSystems(dt, width, height);

    const program = ensureParticleProgram();
    if (!program) {
      drawPreviewSurface(width, height);
      return;
    }

    gl.useProgram(program);
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    if (uResolution) gl.uniform2f(uResolution, width, height);
    if (!particleBuffer) particleBuffer = gl.createBuffer();
    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aSize = gl.getAttribLocation(program, 'a_size');
    const aColor = gl.getAttribLocation(program, 'a_color');

    particleSystems.forEach((system) => {
      if (system.blendMode === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const data = [];
      system.particles.forEach((particle) => {
        const t = Math.max(0, Math.min(1, particle.age / particle.life));
        const size = interpolate(system.sizeStart, system.sizeEnd, t) * 22;
        const color = system.colorStart.map((value, index) => interpolate(value, system.colorEnd[index] ?? value, t));
        data.push(particle.x, particle.y, Math.max(2, size), color[0], color[1], color[2], color[3] * system.opacity);
      });
      if (data.length === 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      const stride = 28;
      if (aPosition >= 0) {
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);
      }
      if (aSize >= 0) {
        gl.enableVertexAttribArray(aSize);
        gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
      }
      if (aColor >= 0) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 12);
      }
      gl.drawArrays(gl.POINTS, 0, data.length / 7);
    });
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function draw() {
    const previousTick = tick || performance.now();
    tick = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (tick - previousTick) / 1000));
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
    else if (payload.tool === 'particle-system-playground') drawParticlePreview(width, height, dt);
    else drawPreviewSurface(width, height);
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'feather-showcase' || event.data?.type !== 'preview:update') return;
    payload = event.data.payload || payload;
    window._featherPayload = payload;
    if (payload.tool !== 'particle-system-playground') particlePayloadKey = '';
    shaderError = null;
    updateShaderStatus();
  });
  window.parent?.postMessage({ source: 'feather-showcase', type: 'preview:ready' }, '*');

  resize();
  draw();
})();
