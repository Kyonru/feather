import { openUrl as handleUrl, openPath } from '@tauri-apps/plugin-opener';
import { isWeb } from './platform';
import { copyToClipboardWithMeta } from './strings';
import { toast } from 'sonner';

export function openUrl(url: string) {
  if (isWeb()) {
    open(url);
    return;
  }

  handleUrl(url);
}

export function openFolder(path: string) {
  if (isWeb()) {
    copyToClipboardWithMeta(path);
    toast.success('Path copied to clipboard', {
      position: 'bottom-center',
    });

    return;
  }
  // FIXME: Need to improve security by asking the users what type of operations, commands and folders are run/opened/created
  // https://github.com/tauri-apps/tauri/issues/13971#issuecomment-3758890117

  openPath(path);
}
