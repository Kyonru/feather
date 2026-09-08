import { toast } from 'sonner';
import type { FeatherHost } from '@feather/host';

import { base64ToUint8Array } from './arrays';
import { fetchBlobAsUint8Array } from './assets';

/**
 * Save a file for the user.
 *
 * Previously branched on `isWeb()` and carried two implementations. The host
 * owns that difference now, which is also what keeps `@tauri-apps/plugin-fs`
 * out of the creative tools' import graph.
 */
export async function downloadFile(
  host: FeatherHost,
  name: string,
  src: string,
  type: 'string' | 'base64',
) {
  try {
    if (!src) return;

    const bytes = type === 'base64' ? base64ToUint8Array(src) : await fetchBlobAsUint8Array(src);
    if (!bytes) return;

    await host.saveBinaryFile(name, bytes);

    if (host.kind === 'tauri') {
      toast.success('File added to the downloads folder', { position: 'bottom-center' });
    }
  } catch {
    toast.error('Failed to download file', { position: 'bottom-center' });
  }
}
