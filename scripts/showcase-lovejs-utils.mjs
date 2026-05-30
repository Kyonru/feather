/* eslint-disable no-undef */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

export const LOVEJS_REPO = 'https://github.com/2dengine/love.js';
const LOVEJS_PREVIEW_QUERY = 'g=showcase.love&v=11.5&featherPreview=preview-bridge-v7';

export const loveJsContentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.love', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.wasm', 'application/wasm'],
  ['.worker.js', 'text/javascript; charset=utf-8'],
]);

export function isLoveJsVendor(dir) {
  return (
    Boolean(dir) &&
    existsSync(path.join(dir, 'index.html')) &&
    (existsSync(path.join(dir, 'player.js')) ||
      existsSync(path.join(dir, 'player.min.js')) ||
      existsSync(path.join(dir, 'love.js')))
  );
}

export function loveJsSetupMessage(root) {
  const relativeVendor = path.relative(root, path.join(root, '.showcase-vendor/love.js'));
  return [
    'Real love.js player not found for the showcase preview.',
    `Expected ${relativeVendor}, vendor/love.js, or SHOWCASE_LOVEJS_DIR.`,
    'Set SHOWCASE_LOVEJS_DIR=/path/to/love.js or allow the helper to clone https://github.com/2dengine/love.js.',
  ].join(' ');
}

export function resolveLoveJsVendor({
  root,
  cacheDir = path.join(root, '.showcase-vendor/love.js'),
  fetchIfMissing = true,
  required = false,
} = {}) {
  const envVendor = process.env.SHOWCASE_LOVEJS_DIR ? path.resolve(root, process.env.SHOWCASE_LOVEJS_DIR) : undefined;
  const candidates = [envVendor, path.join(root, 'vendor/love.js'), cacheDir].filter(Boolean);
  let vendorDir = candidates.find((candidate) => isLoveJsVendor(candidate));

  if (!vendorDir && fetchIfMissing) {
    mkdirSync(path.dirname(cacheDir), { recursive: true });
    if (!existsSync(cacheDir)) {
      const result = spawnSync('git', ['clone', '--depth', '1', LOVEJS_REPO, cacheDir], {
        cwd: root,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      if (result.status !== 0 && required) {
        const detail = result.stderr.trim() || result.stdout.trim() || 'git clone failed';
        throw new Error(`${loveJsSetupMessage(root)} Clone failed: ${detail}`);
      }
    }
    if (isLoveJsVendor(cacheDir)) {
      vendorDir = cacheDir;
    }
  }

  if (!vendorDir && required) {
    throw new Error(loveJsSetupMessage(root));
  }
  return vendorDir;
}

export async function patchLoveJsPlayer(dir) {
  const readyBridge =
    "if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'feather-showcase', type: 'preview:ready' }, '*');";
  const uploadBridge = [
    '',
    '// Feather showcase upload bridge: keep large base64 texture payloads out of the Lua polling JSON.',
    '(function() {',
    '  window._featherUploadCache = window._featherUploadCache || Object.create(null);',
    '  window._featherUploadChunk = function(key, start, length) {',
    "    var cache = window._featherUploadCache || (window.parent && window.parent.__featherPreviewUploadCache) || null;",
    "    var data = cache && cache[String(key)] || '';",
    '    return data.slice(Number(start) || 0, (Number(start) || 0) + (Number(length) || 0));',
    '  };',
    '  function storeUpload(upload, fallbackKey) {',
    "    if (!upload || typeof upload !== 'object') return upload || null;",
    "    if (typeof upload.dataBase64 !== 'string' || upload.dataBase64.length === 0) return upload;",
    '    var key = [fallbackKey, upload.uniform || "", upload.filename || "", upload.dataBase64.length].join(":");',
    '    window._featherUploadCache[key] = upload.dataBase64;',
    '    var next = Object.assign({}, upload);',
    "    next.dataBase64 = '';",
    '    next.dataKey = key;',
    '    next.dataLength = upload.dataBase64.length;',
    '    return next;',
    '  }',
    '  function stripPayload(payload) {',
    "    if (!payload || typeof payload !== 'object') return payload || null;",
    '    var next = Object.assign({}, payload);',
    "    next.baseTexture = storeUpload(payload.baseTexture, 'baseTexture');",
    '    if (Array.isArray(payload.textures)) {',
    '      next.textures = payload.textures.map(function(upload, index) {',
    "        return storeUpload(upload, 'texture-' + index);",
    '      });',
    '    }',
    '    return next;',
    '  }',
    "  window.addEventListener('message', function(e) {",
    "    if (!e.data || e.data.source !== 'feather-showcase' || e.data.type !== 'preview:update') return;",
    '    window._featherPayload = stripPayload(e.data.payload);',
    '  });',
    '}());',
    '',
  ].join('\n');
  const bridge = [
    '',
    '// Feather showcase bridge: store postMessage preview payload for love.js.eval() polling',
    'window._featherPayload = null;',
    'window._featherUploadCache = window._featherUploadCache || Object.create(null);',
    'window._featherUploadChunk = window._featherUploadChunk || function(key, start, length) {',
    "  var cache = window._featherUploadCache || (window.parent && window.parent.__featherPreviewUploadCache) || null;",
    "  var data = cache && cache[String(key)] || '';",
    '  return data.slice(Number(start) || 0, (Number(start) || 0) + (Number(length) || 0));',
    '};',
    'function featherStoreUpload(upload, fallbackKey) {',
    "  if (!upload || typeof upload !== 'object') return upload || null;",
    "  if (typeof upload.dataBase64 !== 'string' || upload.dataBase64.length === 0) return upload;",
    '  var key = [fallbackKey, upload.uniform || "", upload.filename || "", upload.dataBase64.length].join(":");',
    '  window._featherUploadCache[key] = upload.dataBase64;',
    '  var next = Object.assign({}, upload);',
    "  next.dataBase64 = '';",
    '  next.dataKey = key;',
    '  next.dataLength = upload.dataBase64.length;',
    '  return next;',
    '}',
    'function featherStripPreviewPayload(payload) {',
    "  if (!payload || typeof payload !== 'object') return payload || null;",
    '  var next = Object.assign({}, payload);',
    "  next.baseTexture = featherStoreUpload(payload.baseTexture, 'baseTexture');",
    '  if (Array.isArray(payload.textures)) {',
    '    next.textures = payload.textures.map(function(upload, index) {',
    "      return featherStoreUpload(upload, 'texture-' + index);",
    '    });',
    '  }',
    '  return next;',
    '}',
    "window.addEventListener('message', function(e) {",
    "  if (!e.data || e.data.source !== 'feather-showcase' || e.data.type !== 'preview:update') return;",
    '  window._featherPayload = featherStripPreviewPayload(e.data.payload);',
    '});',
    readyBridge,
    '',
  ].join('\n');
  const candidates = ['player.min.js', 'player.js'].map((file) => path.join(dir, file));
  const target = candidates.find((file) => existsSync(file));
  if (!target) return;
  const existing = await readFile(target, 'utf8');
  if (!existing.includes('_featherPayload')) {
    await writeFile(target, existing + bridge);
    return;
  }
  if (!existing.includes('_featherUploadChunk') || !existing.includes('__featherPreviewUploadCache')) {
    await writeFile(target, existing + uploadBridge + (existing.includes('preview:ready') ? '' : `\n${readyBridge}\n`));
    return;
  }
  if (!existing.includes('preview:ready')) {
    await writeFile(target, `${existing}\n${readyBridge}\n`);
  }
}

export async function patchLoveJsIndex(dir) {
  const indexPath = path.join(dir, 'index.html');
  const playerScript = existsSync(path.join(dir, 'player.min.js')) ? 'player.min.js' : 'player.js';
  const fallback = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Feather love.js Preview</title></head>',
    `<body><canvas id="canvas"></canvas><script src="./${playerScript}?${LOVEJS_PREVIEW_QUERY}"></script></body>`,
    '</html>',
    '',
  ].join('\n');

  const existing = existsSync(indexPath) ? await readFile(indexPath, 'utf8') : fallback;
  let next = existing
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Feather love.js Preview</title>')
    .replace(/<base\s+href=["'][^"']*["']\s*\/?>/i, '<base href="./">')
    .replace(/player(?:\.min)?\.js(?:\?g=[^"']*)?/g, `${playerScript}?${LOVEJS_PREVIEW_QUERY}`);

  if (!/<title>/i.test(next)) {
    next = next.replace(/<head[^>]*>/i, (match) => `${match}<title>Feather love.js Preview</title>`);
  }
  if (!/\?g=showcase\.love/.test(next)) {
    next = next.replace('</body>', `<script src="./${playerScript}?${LOVEJS_PREVIEW_QUERY}"></script></body>`);
  }
  await writeFile(indexPath, next);
}

export async function writeWebglPreviewFallback({ root, outDir } = {}) {
  const sourceDir = path.join(root, 'public/showcase-lovejs');
  const sourcePlayer = path.join(sourceDir, 'player.js');
  const sourceStyle = path.join(sourceDir, 'style.css');
  const targetPlayer = path.join(outDir, 'webgl-player.js');
  const targetStyle = path.join(outDir, 'webgl-style.css');

  if (existsSync(sourcePlayer)) {
    await cp(sourcePlayer, targetPlayer);
  }
  if (existsSync(sourceStyle)) {
    await cp(sourceStyle, targetStyle);
  }

  await writeFile(
    path.join(outDir, 'webgl.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Feather WebGL Preview</title>',
      '  <link rel="stylesheet" href="./webgl-style.css" />',
      '</head>',
      '<body>',
      '  <script src="./webgl-player.js?featherPreview=webgl-preview-v1"></script>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
  );
}

export async function copyLoveJsVendor({ root, outDir, required = true, fetchIfMissing = true } = {}) {
  const vendorDir = resolveLoveJsVendor({ root, fetchIfMissing, required });
  if (!vendorDir) return null;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.dirname(outDir), { recursive: true });
  await cp(vendorDir, outDir, {
    recursive: true,
    dereference: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`),
  });
  await patchLoveJsIndex(outDir);
  await patchLoveJsPlayer(outDir);
  return vendorDir;
}

export async function buildShowcaseLove({ root, outDir } = {}) {
  const sourceDir = path.join(root, 'src-lua/example/showcase_preview');
  const files = {
    'main.lua': await readFile(path.join(sourceDir, 'main.lua'), 'utf8'),
    'conf.lua': await readFile(path.join(sourceDir, 'conf.lua'), 'utf8'),
    'shader-graph/preview_runtime.lua': await readFile(
      path.join(root, 'src-lua/plugins/shader-graph/preview_runtime.lua'),
      'utf8',
    ),
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'showcase.love'),
    zipSync(
      Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
      { level: 9 },
    ),
  );
}

export async function prepareShowcaseLoveJsTarget({ root, outDir, required = true, fetchIfMissing = true } = {}) {
  const vendorDir = await copyLoveJsVendor({ root, outDir, required, fetchIfMissing });
  if (!vendorDir) return null;
  await buildShowcaseLove({ root, outDir });
  await writeWebglPreviewFallback({ root, outDir });
  return vendorDir;
}

export function contentTypeForLoveJsPath(filePath) {
  if (filePath.endsWith('.worker.js')) return loveJsContentTypes.get('.worker.js');
  return loveJsContentTypes.get(path.extname(filePath)) || 'application/octet-stream';
}

export async function resolveLoveJsRequest(outDir, rawUrl) {
  const pathname = new URL(rawUrl || '/', 'http://localhost').pathname;
  const withoutPrefix = pathname.replace(/^\/showcase-lovejs\/?/, '').replace(/^\/+/, '');
  const requested = withoutPrefix === '' ? 'index.html' : withoutPrefix;
  const candidate = path.resolve(outDir, decodeURIComponent(requested));
  if (!candidate.startsWith(`${outDir}${path.sep}`) && candidate !== outDir) {
    const error = new Error('Path escapes love.js directory');
    error.code = 'ENOENT';
    throw error;
  }
  const info = await stat(candidate);
  if (info.isFile()) return candidate;
  const error = new Error('File not found');
  error.code = 'ENOENT';
  throw error;
}
