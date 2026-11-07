import { deflateSync } from 'node:zlib';

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function pngRgba(width: number, height: number, pixels: Array<[number, number, number, number]>) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[y * width + x] ?? [0, 0, 0, 255];
      const offset = y * stride + 1 + x * 4;
      raw[offset] = pixel[0];
      raw[offset + 1] = pixel[1];
      raw[offset + 2] = pixel[2];
      raw[offset + 3] = pixel[3];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

export function shaderPreviewTextureFiles() {
  return {
    water: {
      name: 'water.png',
      mimeType: 'image/png',
      buffer: pngRgba(4, 4, [
        [42, 98, 230, 255], [45, 128, 235, 255], [38, 165, 214, 255], [42, 98, 230, 255],
        [32, 175, 170, 255], [34, 132, 224, 255], [32, 175, 170, 255], [38, 165, 214, 255],
        [42, 98, 230, 255], [31, 180, 155, 255], [44, 122, 235, 255], [31, 180, 155, 255],
        [38, 165, 214, 255], [42, 98, 230, 255], [32, 175, 170, 255], [44, 122, 235, 255],
      ]),
    },
    noise: {
      name: 'simplex-noise-64.png',
      mimeType: 'image/png',
      buffer: pngRgba(4, 4, [
        [238, 72, 97, 255], [69, 214, 162, 255], [78, 102, 235, 255], [242, 205, 85, 255],
        [152, 86, 226, 255], [244, 116, 62, 255], [58, 186, 232, 255], [142, 220, 88, 255],
        [238, 182, 70, 255], [72, 218, 118, 255], [232, 76, 177, 255], [85, 134, 236, 255],
        [62, 205, 212, 255], [226, 90, 92, 255], [118, 226, 74, 255], [212, 86, 236, 255],
      ]),
    },
    mask: {
      name: '3-mask.png',
      mimeType: 'image/png',
      buffer: pngRgba(4, 4, [
        [255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255],
        [255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255],
        [0, 0, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255],
        [255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255],
      ]),
    },
  };
}

export function textureHeavyPreviewGraph() {
  return {
    type: 'feather.shader-graph',
    version: 3,
    exportedAt: new Date('2026-05-29T00:00:00.000Z').toISOString(),
    shaderName: 'texture-heavy-preview',
    playgroundTarget: null,
    nodes: [
      { id: 'base', type: 'shaderNode', position: { x: 0, y: 0 }, data: { label: 'Base Sprite', nodeType: 'TextureColor' } },
      { id: 'uv', type: 'shaderNode', position: { x: 0, y: 140 }, data: { label: 'Source UV', nodeType: 'TextureCoords' } },
      { id: 'noiseTex', type: 'shaderNode', position: { x: 0, y: 300 }, data: { label: 'Noise Texture', nodeType: 'TextureInput', uniformName: 'noiseTexture' } },
      { id: 'noiseSample', type: 'shaderNode', position: { x: 260, y: 260 }, data: { label: 'Sample Noise', nodeType: 'SampleTexture' } },
      { id: 'maskTex', type: 'shaderNode', position: { x: 0, y: 470 }, data: { label: 'Mask Texture', nodeType: 'TextureInput', uniformName: 'maskTexture' } },
      { id: 'maskSample', type: 'shaderNode', position: { x: 260, y: 450 }, data: { label: 'Sample Mask', nodeType: 'SampleTexture' } },
      { id: 'key', type: 'shaderNode', position: { x: 520, y: 430 }, data: { label: 'Red Mask', nodeType: 'ColorKeyMask' } },
      { id: 'opacity', type: 'shaderNode', position: { x: 520, y: 170 }, data: { label: 'Opacity', nodeType: 'FloatConstant', values: { val: 0.85 } } },
      { id: 'mix', type: 'shaderNode', position: { x: 790, y: 170 }, data: { label: 'Masked Texture Mix', nodeType: 'EffectMix' } },
      { id: 'preview', type: 'shaderNode', position: { x: 1060, y: 170 }, data: { label: 'Texture Probe', nodeType: 'Preview' } },
      { id: 'out', type: 'shaderNode', position: { x: 1320, y: 170 }, data: { label: 'Fragment Output', nodeType: 'FragmentOutput' } },
    ],
    edges: [
      { id: 'base:out->mix:base', source: 'base', sourceHandle: 'out', target: 'mix', targetHandle: 'base' },
      { id: 'noiseTex:texture->noiseSample:texture', source: 'noiseTex', sourceHandle: 'texture', target: 'noiseSample', targetHandle: 'texture' },
      { id: 'uv:out->noiseSample:uv', source: 'uv', sourceHandle: 'out', target: 'noiseSample', targetHandle: 'uv' },
      { id: 'noiseSample:out->mix:effect', source: 'noiseSample', sourceHandle: 'out', target: 'mix', targetHandle: 'effect' },
      { id: 'maskTex:texture->maskSample:texture', source: 'maskTex', sourceHandle: 'texture', target: 'maskSample', targetHandle: 'texture' },
      { id: 'uv:out->maskSample:uv', source: 'uv', sourceHandle: 'out', target: 'maskSample', targetHandle: 'uv' },
      { id: 'maskSample:out->key:source', source: 'maskSample', sourceHandle: 'out', target: 'key', targetHandle: 'source' },
      { id: 'key:mask->mix:mask', source: 'key', sourceHandle: 'mask', target: 'mix', targetHandle: 'mask' },
      { id: 'opacity:out->mix:opacity', source: 'opacity', sourceHandle: 'out', target: 'mix', targetHandle: 'opacity' },
      { id: 'mix:out->preview:color', source: 'mix', sourceHandle: 'out', target: 'preview', targetHandle: 'color' },
      { id: 'preview:out->out:color', source: 'preview', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
    subgraphs: [],
  };
}
