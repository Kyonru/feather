const VERT_SRC = `
attribute vec2 a_position;
varying vec2 v_texCoord;
varying vec2 v_screenCoord;
uniform vec2 u_resolution;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  v_screenCoord = v_texCoord * u_resolution;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`.trim();

export function loveShaderUsesDerivatives(source: string): boolean {
  return /\b(?:dFdx|dFdy|fwidth)\s*\(/.test(source);
}

// Convert Love2D GLSL pixel shader to WebGL fragment shader
export function adaptLoveShader(lovePixel: string): string {
  // Extract parameter names from effect() signature
  const sigMatch = lovePixel.match(
    /vec4\s+effect\s*\(\s*vec4\s+(\w+)\s*,\s*(?:Image|sampler2D)\s+(\w+)\s*,\s*vec2\s+(\w+)\s*,\s*vec2\s+(\w+)\s*\)/,
  );
  const colorP = sigMatch?.[1] ?? 'color';
  const texP = sigMatch?.[2] ?? 'tex_param';
  const uvP = sigMatch?.[3] ?? 'texture_coords';
  const screenP = sigMatch?.[4] ?? 'screen_coords';

  let src = lovePixel;
  src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?Image\s+/g, 'uniform $1sampler2D ');
  src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?number\s+/g, 'uniform $1float ');
  src = src.replace(/\bextern\s+(?:(?:lowp|mediump|highp)\s+)?bool\s+/g, 'uniform bool ');
  src = src.replace(/\bextern\s+((?:lowp|mediump|highp)\s+)?int\s+/g, 'uniform $1int ');
  src = src.replace(/\bextern\s+/g, 'uniform ');
  src = src.replace(/\bImage\b/g, 'sampler2D');
  src = src.replace(/\bTexel\s*\(/g, 'texture2D(');
  // Rename effect() to avoid conflict, keep body intact
  src = src.replace(
    /\bvec4\s+effect\s*\([^)]+\)\s*\{/,
    `vec4 feather_effect(vec4 ${colorP}, sampler2D ${texP}, vec2 ${uvP}, vec2 ${screenP}) {`,
  );

  const preamble = [
    ...(loveShaderUsesDerivatives(lovePixel) ? ['#extension GL_OES_standard_derivatives : enable'] : []),
    'precision mediump float;',
    'varying vec2 v_texCoord;',
    'varying vec2 v_screenCoord;',
    'uniform sampler2D u_tex;',
    'uniform vec4 u_color;',
    'uniform vec2 u_resolution;',
    '',
  ].join('\n');

  const mainFn = [
    '',
    'void main() {',
    '  gl_FragColor = feather_effect(u_color, u_tex, v_texCoord, v_screenCoord);',
    '}',
  ].join('\n');

  return preamble + src + mainFn;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function makeWhiteTexture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return buf;
}

export type WebGLPreview = {
  render: (timeSeconds: number) => void;
  destroy: () => void;
  error: string | null;
};

export function createWebGLPreview(canvas: HTMLCanvasElement, lovePixelGlsl: string): WebGLPreview {
  const gl = canvas.getContext('webgl');
  if (!gl) return { render: () => {}, destroy: () => {}, error: 'WebGL not available' };
  if (loveShaderUsesDerivatives(lovePixelGlsl) && !gl.getExtension('OES_standard_derivatives')) {
    return {
      render: () => {},
      destroy: () => {},
      error: 'WebGL preview needs OES_standard_derivatives for dFdx/dFdy/fwidth nodes.',
    };
  }

  const fragSrc = adaptLoveShader(lovePixelGlsl);
  const prog = linkProgram(gl, VERT_SRC, fragSrc);
  if (!prog) return { render: () => {}, destroy: () => {}, error: 'Shader compile error' };

  const quadBuf = makeQuadBuffer(gl);
  const whiteTex = makeWhiteTexture(gl);

  const aPos = gl.getAttribLocation(prog, 'a_position');
  const uResolution = gl.getUniformLocation(prog, 'u_resolution');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uColor = gl.getUniformLocation(prog, 'u_color');
  const uTex = gl.getUniformLocation(prog, 'u_tex');

  // Capture non-null reference so TypeScript retains the narrowing in closures
  const ctx = gl;

  function render(timeSeconds: number) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.viewport(0, 0, w, h);
    ctx.clearColor(0, 0, 0, 1);
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    ctx.useProgram(prog);
    ctx.bindBuffer(ctx.ARRAY_BUFFER, quadBuf);
    ctx.enableVertexAttribArray(aPos);
    ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0);

    ctx.uniform2f(uResolution, w, h);
    ctx.uniform1f(uTime, timeSeconds);
    ctx.uniform4f(uColor, 1, 1, 1, 1);
    ctx.activeTexture(ctx.TEXTURE0);
    ctx.bindTexture(ctx.TEXTURE_2D, whiteTex);
    ctx.uniform1i(uTex, 0);

    ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
  }

  function destroy() {
    ctx.deleteProgram(prog);
    ctx.deleteBuffer(quadBuf);
    ctx.deleteTexture(whiteTex);
  }

  return { render, destroy, error: null };
}
