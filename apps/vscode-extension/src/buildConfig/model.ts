import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// The form model for feather.build.json, kept apart from the webview so it can
// be tested against the CLI's own reader (`apps/cli/src/lib/build/config.ts`).
//
// The schema is the CLI's. This module does not own a copy of it: it names the
// fields the form *shows*, and every other key in the file — release signing,
// Fastlane lanes, Android Gradle tasks, iOS team IDs, keys a newer CLI adds —
// passes through a save untouched. Only fields the user actually edited are
// written, onto the file as it is on disk at save time, so an edit made in a
// text editor while the panel was open is not overwritten either.

export type FieldKind = 'text' | 'folder' | 'file' | 'lines' | 'boolean' | 'integer' | 'choice' | 'map';

export type FieldSpec = {
  path: string;
  label: string;
  kind: FieldKind;
  section: string;
  placeholder?: string;
  hint?: string;
  /** For `choice`: offered values. A value already in the file is always kept on offer. */
  choices?: { value: string; label: string }[];
};

export const SECTIONS = ['General', 'Files', 'Web', 'Windows', 'macOS', 'Linux', 'SteamOS', 'Android', 'iOS', 'Upload'] as const;

export const FIELDS: FieldSpec[] = [
  { section: 'General', path: 'name', label: 'Game name', kind: 'text', placeholder: 'My Game' },
  { section: 'General', path: 'version', label: 'Version', kind: 'text', placeholder: '0.1.0' },
  { section: 'General', path: 'loveVersion', label: 'LÖVE version', kind: 'text', placeholder: '11.5' },
  { section: 'General', path: 'productId', label: 'Product ID', kind: 'text', placeholder: 'com.company.mygame' },
  { section: 'General', path: 'description', label: 'Description', kind: 'text' },
  { section: 'General', path: 'company', label: 'Company', kind: 'text' },
  { section: 'General', path: 'website', label: 'Website', kind: 'text' },
  { section: 'General', path: 'copyright', label: 'Copyright', kind: 'text' },

  { section: 'Files', path: 'sourceDir', label: 'Source directory', kind: 'folder', placeholder: '.', hint: 'Relative to the project.' },
  { section: 'Files', path: 'outDir', label: 'Output directory', kind: 'folder', placeholder: 'builds', hint: 'Relative to the project.' },
  { section: 'Files', path: 'icon', label: 'Icon file', kind: 'file', placeholder: 'icon.png' },
  { section: 'Files', path: 'include', label: 'Include patterns', kind: 'lines', hint: 'One pattern per line.' },
  { section: 'Files', path: 'exclude', label: 'Exclude patterns', kind: 'lines', hint: 'One pattern per line, added to the CLI defaults.' },
  { section: 'Files', path: 'includeRuntime', label: 'Bundle the Feather runtime in build output', kind: 'boolean' },

  { section: 'Web', path: 'targets.web.loveJsDir', label: 'love.js vendor directory', kind: 'folder', placeholder: 'vendor/love.js' },
  { section: 'Web', path: 'targets.web.title', label: 'HTML title', kind: 'text' },
  { section: 'Web', path: 'targets.web.outputName', label: 'Output name', kind: 'text', placeholder: 'game' },

  { section: 'Windows', path: 'targets.windows.loveRuntimeDir', label: 'LÖVE Windows runtime directory', kind: 'folder', placeholder: 'vendor/love-windows' },
  { section: 'macOS', path: 'targets.macos.loveRuntimeDir', label: 'LÖVE macOS runtime directory', kind: 'folder', placeholder: 'vendor/love-macos' },
  { section: 'Linux', path: 'targets.linux.loveRuntimeDir', label: 'LÖVE Linux runtime directory', kind: 'folder', placeholder: 'vendor/love-linux' },
  {
    section: 'SteamOS',
    path: 'targets.steamos.loveRuntimeDir',
    label: 'LÖVE SteamOS runtime directory',
    kind: 'folder',
    placeholder: 'vendor/love-linux',
    hint: 'Empty falls back to the Linux runtime directory.',
  },

  { section: 'Android', path: 'targets.android.loveAndroidDir', label: 'love-android vendor directory', kind: 'folder', placeholder: 'vendor/love-android' },
  { section: 'Android', path: 'targets.android.productId', label: 'Package name', kind: 'text', placeholder: 'com.company.mygame' },
  { section: 'Android', path: 'targets.android.displayName', label: 'Display name', kind: 'text' },
  { section: 'Android', path: 'targets.android.versionCode', label: 'Version code', kind: 'integer', placeholder: '1' },
  { section: 'Android', path: 'targets.android.versionName', label: 'Version name', kind: 'text', placeholder: '1.0' },
  {
    section: 'Android',
    path: 'targets.android.orientation',
    label: 'Orientation',
    kind: 'choice',
    choices: [
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
      { value: 'sensorLandscape', label: 'Sensor landscape' },
      { value: 'sensorPortrait', label: 'Sensor portrait' },
    ],
  },

  { section: 'iOS', path: 'targets.ios.loveIosDir', label: 'love-ios vendor directory', kind: 'folder', placeholder: 'vendor/love-ios' },
  { section: 'iOS', path: 'targets.ios.bundleIdentifier', label: 'Bundle identifier', kind: 'text', placeholder: 'com.company.mygame' },
  { section: 'iOS', path: 'targets.ios.displayName', label: 'Display name', kind: 'text' },
  { section: 'iOS', path: 'targets.ios.scheme', label: 'Xcode scheme', kind: 'text', placeholder: 'love' },
  { section: 'iOS', path: 'targets.ios.configuration', label: 'Build configuration', kind: 'text', placeholder: 'Release' },
  { section: 'iOS', path: 'targets.ios.deploymentTarget', label: 'Deployment target', kind: 'text', placeholder: '16.0' },

  { section: 'Upload', path: 'upload.itch.project', label: 'itch.io project', kind: 'text', placeholder: 'username/game-name' },
  { section: 'Upload', path: 'upload.itch.channels', label: 'itch.io channels', kind: 'map', hint: 'One per line: platform=channel-name' },
];

export type BuildConfigObject = Record<string, unknown>;
export type FormValues = Record<string, string | boolean>;
export type FieldError = { path: string; message: string };

export type ReadResult =
  | { ok: true; exists: boolean; config: BuildConfigObject }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Same acceptance rule as the CLI's `readBuildConfig`: valid JSON whose root is an object. */
export function parseBuildConfig(text: string): ReadResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed)) return { ok: false, error: 'Invalid feather.build.json: Config root must be an object.' };
    return { ok: true, exists: true, config: parsed };
  } catch (err) {
    return { ok: false, error: `Invalid feather.build.json: ${(err as Error).message}` };
  }
}

export function readBuildConfigFile(path: string): ReadResult {
  if (!existsSync(path)) return { ok: true, exists: false, config: {} };
  return parseBuildConfig(readFileSync(path, 'utf8'));
}

export function serializeBuildConfig(config: BuildConfigObject): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function writeBuildConfigFile(path: string, config: BuildConfigObject): void {
  writeFileSync(path, serializeBuildConfig(config), 'utf8');
}

export function getAt(config: unknown, path: string): unknown {
  let current: unknown = config;
  for (const key of path.split('.')) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function setAt(config: BuildConfigObject, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = config;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys.at(-1)!] = value;
}

/** Delete a key, then any parent objects the deletion left empty. */
function deleteAt(config: BuildConfigObject, path: string): void {
  const keys = path.split('.');
  const parents: Record<string, unknown>[] = [config];
  for (const key of keys.slice(0, -1)) {
    const next = parents.at(-1)![key];
    if (!isObject(next)) return;
    parents.push(next);
  }
  delete parents.at(-1)![keys.at(-1)!];
  for (let depth = parents.length - 1; depth > 0; depth -= 1) {
    if (Object.keys(parents[depth]).length > 0) break;
    delete parents[depth - 1][keys[depth - 1]];
  }
}

/** How a stored value appears in its form control. */
export function formValue(field: FieldSpec, value: unknown): string | boolean {
  if (field.kind === 'boolean') return value === true;
  if (value === undefined || value === null) return '';
  if (field.kind === 'lines') return Array.isArray(value) ? value.map(String).join('\n') : String(value);
  if (field.kind === 'map') {
    return isObject(value) ? Object.entries(value).map(([key, item]) => `${key}=${String(item)}`).join('\n') : String(value);
  }
  return String(value);
}

export function formValues(config: BuildConfigObject): FormValues {
  return Object.fromEntries(FIELDS.map((field) => [field.path, formValue(field, getAt(config, field.path))]));
}

type Parsed = { value: unknown } | { remove: true } | { error: string };

function parseField(field: FieldSpec, raw: string | boolean): Parsed {
  if (field.kind === 'boolean') return raw === true ? { value: true } : { remove: true };
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { remove: true };
  if (field.kind === 'integer') {
    if (!/^\d+$/.test(text)) return { error: `${field.label} must be a whole number.` };
    return { value: Number(text) };
  }
  if (field.kind === 'lines') {
    const items = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return items.length > 0 ? { value: items } : { remove: true };
  }
  if (field.kind === 'map') {
    const entries: [string, string][] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const at = line.indexOf('=');
      const key = at < 0 ? '' : line.slice(0, at).trim();
      const value = at < 0 ? '' : line.slice(at + 1).trim();
      if (!key || !value) return { error: `${field.label}: "${line.trim()}" is not platform=channel.` };
      entries.push([key, value]);
    }
    return entries.length > 0 ? { value: Object.fromEntries(entries) } : { remove: true };
  }
  return { value: text };
}

/**
 * Apply the fields the user changed (`current` differs from `initial`) onto
 * `base`, the file as it is now. Untouched fields keep their stored value
 * byte-for-byte, including values the form could not represent.
 */
export function applyFormChanges(
  base: BuildConfigObject,
  initial: FormValues,
  current: FormValues,
): { config: BuildConfigObject; errors: FieldError[]; changed: string[] } {
  const config = structuredClone(base);
  const errors: FieldError[] = [];
  const changed: string[] = [];
  for (const field of FIELDS) {
    if (!(field.path in current) || current[field.path] === initial[field.path]) continue;
    const parsed = parseField(field, current[field.path]);
    if ('error' in parsed) {
      errors.push({ path: field.path, message: parsed.error });
      continue;
    }
    changed.push(field.path);
    if ('remove' in parsed) deleteAt(config, field.path);
    else setAt(config, field.path, parsed.value);
  }
  return { config, errors, changed };
}

/**
 * A browsed path is stored relative to the project when it is inside it — the
 * CLI rejects absolute `sourceDir`/`outDir` — and left absolute otherwise, so
 * the CLI's own check reports it rather than the extension guessing.
 */
export function projectRelativePath(root: string, picked: string): string {
  const rel = relative(resolve(root), resolve(picked));
  if (rel === '') return '.';
  if (rel.startsWith('..') || isAbsolute(rel)) return picked;
  return rel.split(sep).join('/');
}
