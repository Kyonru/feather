import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { FeatherHost, HostBinaryFile, HostTextFile, OpenOptions, SaveTextOptions } from './types';

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function filters(options?: OpenOptions | SaveTextOptions) {
  if (!options?.extensions?.length) return undefined;
  return [{ name: options.filterName ?? 'Files', extensions: options.extensions }];
}

/** The desktop implementation. This is the only place `@tauri-apps/*` is imported. */
export function createTauriHost(): FeatherHost {
  return {
    kind: 'tauri',

    async openBinaryFile(options): Promise<HostBinaryFile | null> {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: options?.title,
        filters: filters(options),
      });
      const path = typeof selected === 'string' ? selected : null;
      if (!path) return null;
      const bytes = await readFile(path);
      return { path, name: basename(path), bytes };
    },

    async openTextFile(options): Promise<HostTextFile | null> {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: options?.title,
        filters: filters(options),
      });
      const path = typeof selected === 'string' ? selected : null;
      if (!path) return null;
      return { path, name: basename(path), text: await readTextFile(path) };
    },

    async saveTextFile(options: SaveTextOptions): Promise<boolean> {
      const path = await saveDialog({
        defaultPath: options.defaultName,
        filters: filters(options),
      });
      if (!path) return false;
      await writeTextFile(path, options.text);
      return true;
    },

    async saveBinaryFile(name: string, bytes: Uint8Array): Promise<boolean> {
      await writeFile(name, bytes, { baseDir: BaseDirectory.Download });
      return true;
    },

    assetUrl(path: string): string {
      return convertFileSrc(path);
    },
  };
}
