/**
 * What the surrounding environment can do.
 *
 * The creative tools (shader graph, texture lab, particle playground) run in two
 * places: inside the Tauri desktop app, and as a plain web page in the showcase.
 * Before this package they imported `@tauri-apps/*` directly, which is why the
 * desktop pages ended up importing browser implementations out of
 * `src/showcase/` — the capability had no name, so the seam was crossed instead.
 *
 * The surface is deliberately small: it is exactly what the studio actually
 * uses, derived from its five Tauri call sites, not a speculative filesystem API.
 */

export interface HostBinaryFile {
  /** Absolute path on desktop; empty string on web, which has no real paths. */
  path: string;
  name: string;
  bytes: Uint8Array;
}

export interface HostTextFile {
  path: string;
  name: string;
  text: string;
}

export interface OpenOptions {
  /** File extensions without the dot, e.g. ['png', 'jpg']. */
  extensions?: string[];
  /** Label shown for the filter, e.g. 'Images'. */
  filterName?: string;
  title?: string;
  /**
   * `data-testid` for the web implementation's file input.
   *
   * The web host creates its input on demand, so a test cannot select it unless
   * the caller names it. Ignored by the Tauri host, which uses a native dialog.
   */
  testId?: string;
}

export interface SaveTextOptions {
  defaultName: string;
  extensions?: string[];
  filterName?: string;
  text: string;
}

export interface FeatherHost {
  /** Which implementation is running. Useful for host-specific affordances. */
  readonly kind: 'tauri' | 'web';

  /** Pick a file and read its bytes. Resolves null when the user cancels. */
  openBinaryFile(options?: OpenOptions): Promise<HostBinaryFile | null>;

  /** Pick a file and read it as text. Resolves null when the user cancels. */
  openTextFile(options?: OpenOptions): Promise<HostTextFile | null>;

  /**
   * Write text somewhere the user chooses. Resolves false when they cancel.
   *
   * On web this triggers a download rather than prompting for a path, so the
   * caller must not assume a path exists afterwards.
   */
  saveTextFile(options: SaveTextOptions): Promise<boolean>;

  /**
   * Write bytes somewhere the user can find them.
   *
   * The desktop writes to the Downloads folder; the web triggers a download.
   * Resolves false when the write did not happen.
   */
  saveBinaryFile(name: string, bytes: Uint8Array): Promise<boolean>;

  /**
   * A URL the renderer can load for a local file path.
   *
   * On web there are no local paths, so this returns the input unchanged and is
   * only meaningful for values that are already URLs or object URLs.
   */
  assetUrl(path: string): string;
}
