import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export type AtomicWriteOptions = {
  /** File mode for a new file. An existing file keeps its current mode. */
  mode?: number;
  /** Flush file data to disk before the rename. Defaults to true. */
  fsync?: boolean;
  /** Test seam: runs after the temp file is complete and before it replaces the target. */
  beforeRename?: (tempPath: string) => void;
};

function tempPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
}

function fsyncDirectory(dir: string): void {
  // Directory fsync makes the rename durable on POSIX. Windows cannot open directories, so this
  // is best effort by design.
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch {
    // ignore
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Replace `path` with `data` so that readers only ever see the previous complete file or the new
 * complete file: the data goes to a temp file in the same directory, is flushed, then renamed over
 * the target. An interruption at any point leaves the previous version readable.
 */
export function writeFileAtomicSync(path: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let mode = options.mode ?? 0o666;
  if (existsSync(path)) {
    try {
      mode = statSync(path).mode & 0o7777;
    } catch {
      // keep default
    }
  }

  const tempPath = tempPathFor(path);
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, 'wx', mode);
    let offset = 0;
    while (offset < buffer.length) {
      offset += writeSync(fd, buffer, offset, buffer.length - offset);
    }
    if (options.fsync !== false) fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    options.beforeRename?.(tempPath);
    renameSync(tempPath, path);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // temp file was never created or already renamed
    }
    throw error;
  }
  if (options.fsync !== false) fsyncDirectory(dir);
}

/** JSON convenience wrapper: pretty-printed with a trailing newline, written atomically. */
export function writeJsonAtomicSync(path: string, value: unknown, options: AtomicWriteOptions = {}): void {
  writeFileAtomicSync(path, `${JSON.stringify(value, null, 2)}\n`, options);
}
