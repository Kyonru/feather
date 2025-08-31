import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';

import { base64ToUint8Array } from './arrays';
import { fetchBlobAsUint8Array } from './assets';
import { isWeb } from './platform';

export async function downloadFile(name: string, src: string, type: 'string' | 'base64') {
  if (!src) {
    return;
  }

  let file;

  if (isWeb()) {
    let url = src;

    if (type === 'base64') {
      const byteArray = base64ToUint8Array(src);
      const blob = new Blob([byteArray] as BlobPart[], { type: 'application/octet-stream' });
      url = URL.createObjectURL(blob);
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
    return;
  }

  if (type === 'string') {
    file = await fetchBlobAsUint8Array(src);
  }

  if (type === 'base64') {
    file = await base64ToUint8Array(src);
  }

  if (!file) {
    return;
  }

  await writeFile(name, file, {
    baseDir: BaseDirectory.Download,
  });
}
