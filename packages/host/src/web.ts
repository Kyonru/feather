import type { FeatherHost, HostBinaryFile, HostTextFile, OpenOptions, SaveTextOptions } from './types';

function acceptAttribute(options?: OpenOptions | SaveTextOptions): string {
  if (!options?.extensions?.length) return '';
  return options.extensions.map((ext) => `.${ext}`).join(',');
}

/**
 * Pick a file with a detached <input type="file">.
 *
 * Resolving null on cancel is the awkward part: browsers fire no reliable cancel
 * event, so this settles on whichever of `change` or the window regaining focus
 * happens first. Without the focus fallback a cancelled picker would leave the
 * caller awaiting forever.
 */
function pickFile(options?: OpenOptions): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptAttribute(options);
    if (options?.testId) {
      input.dataset.testid = options.testId;
    }
    // Positioned offscreen rather than display:none — the input must stay
    // selectable for tests that drive it with setInputFiles.
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };

    const onFocus = () => {
      // Give `change` a chance to land first; focus returns before it fires.
      window.setTimeout(() => finish(input.files?.[0] ?? null), 300);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    window.addEventListener('focus', onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

/** The browser implementation, used by the showcase and any non-Tauri host. */
export function createWebHost(): FeatherHost {
  return {
    kind: 'web',

    async openBinaryFile(options): Promise<HostBinaryFile | null> {
      const file = await pickFile(options);
      if (!file) return null;
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { path: '', name: file.name, bytes };
    },

    async openTextFile(options): Promise<HostTextFile | null> {
      const file = await pickFile(options);
      if (!file) return null;
      return { path: '', name: file.name, text: await file.text() };
    },

    async saveTextFile(options: SaveTextOptions): Promise<boolean> {
      // The web has no save dialog, so this downloads instead. Callers must not
      // assume a path exists afterwards — the interface documents that.
      const blob = new Blob([options.text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = options.defaultName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return true;
    },

    async saveBinaryFile(name: string, bytes: Uint8Array): Promise<boolean> {
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return true;
    },

    assetUrl(path: string): string {
      // No local paths on the web; anything already a URL passes through.
      return path;
    },
  };
}
