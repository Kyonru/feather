import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import type { ShaderTextureUpload } from '@/types/shader-graph';
import { isWeb } from '@/utils/platform';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function filename(path: string) {
  return path.split(/[\\/]/).pop() || 'texture.png';
}

export async function pickShaderTexture(): Promise<ShaderTextureUpload | null> {
  if (isWeb()) {
    toast.error('Texture upload is available in the desktop app');
    return null;
  }

  const path = await openFileDialog({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga'] }],
  });
  if (!path || typeof path !== 'string') return null;

  const bytes = await readFile(path);
  return { filename: filename(path), dataBase64: bytesToBase64(bytes) };
}
