import { openUrl as handleUrl } from '@tauri-apps/plugin-opener';
import { isWeb } from './platform';

export function openUrl(url: string) {
  if (isWeb()) {
    open(url);
    return;
  }

  handleUrl(url);
}
