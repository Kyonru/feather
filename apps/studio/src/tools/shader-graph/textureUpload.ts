import type { FeatherHost } from '@feather/host';
import type { ShaderTextureUpload } from '@studio/types/shader-graph';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Pick an image and return it base64-encoded.
 *
 * Previously this branched on `isWeb()` and carried a second, hand-rolled
 * browser file picker. The host owns that difference now, so there is one path.
 */
export async function pickShaderTexture(host: FeatherHost): Promise<ShaderTextureUpload | null> {
  const file = await host.openBinaryFile({
    filterName: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga'],
    testId: 'shader-texture-upload-input',
  });
  if (!file) return null;
  return { filename: file.name || 'texture.png', dataBase64: bytesToBase64(file.bytes) };
}
