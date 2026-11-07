import { isTauri } from '@tauri-apps/api/core';

export function isWeb() {
  return !isTauri();
}
