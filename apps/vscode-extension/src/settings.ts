import { isAbsolute, relative, resolve, sep } from 'node:path';

// Pure translations from editor input to CLI arguments. No policy: the CLI
// still validates whatever these produce.

/**
 * `feather.vendorDir` → `--vendor-dir`. The CLI takes a vendor directory
 * *relative to the project*; the extension used to pass this setting as
 * `--dir`, which made the CLI treat the vendor folder as the project and write
 * `vendor/` and `feather.build.json` inside it.
 */
export function vendorDirOption(root: string, configured: string | undefined):
  | { ok: true; value: string | undefined }
  | { ok: false; error: string } {
  const value = configured?.trim();
  if (!value) return { ok: true, value: undefined };
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const rel = relative(resolve(root), absolute);
  if (rel === '') return { ok: true, value: undefined };
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { ok: false, error: `feather.vendorDir (${value}) must be a folder inside the project ${root}.` };
  }
  return { ok: true, value: rel.split(sep).join('/') };
}

/** A Lua file inside the project → the module name hot reload allows (`a/b/init.lua` → `a.b`). */
export function hotReloadModuleName(root: string, filePath: string): string | undefined {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) return undefined;
  if (!rel.endsWith('.lua')) return undefined;
  const withoutExt = rel.slice(0, -'.lua'.length);
  const modulePath = withoutExt.endsWith('/init') ? withoutExt.slice(0, -'/init'.length) : withoutExt;
  return modulePath.split('/').filter(Boolean).join('.');
}
