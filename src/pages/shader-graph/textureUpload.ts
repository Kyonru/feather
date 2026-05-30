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

function pickWebTexture(): Promise<ShaderTextureUpload | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/bmp,image/webp,image/tga';
    input.dataset.testid = 'shader-texture-upload-input';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        const result = typeof reader.result === 'string' ? reader.result : '';
        const dataBase64 = result.includes(',') ? result.split(',').pop() ?? '' : result;
        resolve({ filename: file.name || 'texture.png', dataBase64 });
      };
      reader.onerror = () => {
        cleanup();
        toast.error('Failed to read texture file');
        resolve(null);
      };
      reader.readAsDataURL(file);
    }, { once: true });

    input.click();
  });
}

export async function pickShaderTexture(): Promise<ShaderTextureUpload | null> {
  if (isWeb()) {
    return pickWebTexture();
  }

  const path = await openFileDialog({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga'] }],
  });
  if (!path || typeof path !== 'string') return null;

  const bytes = await readFile(path);
  return { filename: filename(path), dataBase64: bytesToBase64(bytes) };
}
