import { base64ToUint8Array } from '@studio/utils/arrays';
import type { PlaygroundTarget } from '@studio/types/shader-graph';
import type { GeneratedGlsl, ShaderTextureUpload } from '@studio/types/shader-graph';

const MAX_BUNDLE_TEXTURE_BYTES = 32 * 1024 * 1024;

function safeName(value: string, fallback: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export function shaderBundleEntries(input: {
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  generated: GeneratedGlsl;
  textureUploads: Record<string, ShaderTextureUpload>;
}): Record<string, Uint8Array> {
  const { shaderName, playgroundTarget, generated, textureUploads } = input;
  const entries: Record<string, Uint8Array> = {
    'pixel.glsl': new TextEncoder().encode(generated.pixel),
  };
  if (generated.vertex) entries['vertex.glsl'] = new TextEncoder().encode(generated.vertex);

  let totalTextureBytes = 0;
  const textureBindings = (generated.textures ?? []).map((binding) => {
    const upload = textureUploads[binding.nodeId];
    if (!upload) return { ...binding, file: null };
    const bytes = base64ToUint8Array(upload.dataBase64);
    totalTextureBytes += bytes.byteLength;
    if (totalTextureBytes > MAX_BUNDLE_TEXTURE_BYTES) {
      throw new Error('Shader bundle textures exceed 32 MiB total. Remove large uploads or export them separately.');
    }
    const file = `textures/${safeName(binding.nodeId, 'texture')}_${safeName(upload.filename, 'texture.png')}`;
    entries[file] = bytes;
    return { ...binding, file };
  });

  const manifest = {
    type: 'feather.shader-bundle',
    version: 1,
    shaderName,
    stages: { pixel: 'pixel.glsl', ...(generated.vertex ? { vertex: 'vertex.glsl' } : {}) },
    loveShaderSource: generated.vertex ? 'Concatenate pixel.glsl, a newline, then vertex.glsl.' : 'Use pixel.glsl.',
    playgroundTarget,
    textures: textureBindings,
    parameters: generated.parameters ?? [],
  };
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  return entries;
}
