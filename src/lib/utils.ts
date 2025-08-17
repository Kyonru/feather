import { isTauri } from '@tauri-apps/api/core';
import { openUrl as handleUrl } from '@tauri-apps/plugin-opener';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function copyToClipboardWithMeta(value: string) {
  navigator.clipboard.writeText(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function timeout<T>(ms: number, promise: Promise<any>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT'));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((reason) => {
        clearTimeout(timer);
        reject(reason);
      });
  });
}

export function isWeb() {
  return !isTauri();
}

export function openUrl(url: string) {
  if (isWeb()) {
    open(url);
    return;
  }

  handleUrl(url);
}
