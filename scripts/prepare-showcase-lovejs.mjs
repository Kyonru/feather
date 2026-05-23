/* eslint-disable no-undef */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'dist-showcase/showcase-lovejs');
const cacheDir = path.join(root, '.showcase-vendor/love.js');
const repo = 'https://github.com/2dengine/love.js';

const envVendor = process.env.SHOWCASE_LOVEJS_DIR ? path.resolve(root, process.env.SHOWCASE_LOVEJS_DIR) : undefined;

const candidates = [envVendor, path.join(root, 'vendor/love.js'), cacheDir].filter(Boolean);

let vendorDir = candidates.find((candidate) => isLoveJsVendor(candidate));

if (!vendorDir && process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== '1') {
  await mkdir(path.dirname(cacheDir), { recursive: true });
  if (!existsSync(cacheDir)) {
    const result = spawnSync('git', ['clone', '--depth', '1', repo, cacheDir], {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || 'git clone failed';
      console.warn(`[showcase] Could not fetch love.js automatically: ${detail}`);
    }
  }
  if (isLoveJsVendor(cacheDir)) {
    vendorDir = cacheDir;
  }
}

if (!vendorDir) {
  console.warn('[showcase] Real love.js player not found; keeping the bridge preview from public/showcase-lovejs/.');
  console.warn(
    '[showcase] Set SHOWCASE_LOVEJS_DIR=/path/to/love.js or run `feather build vendor add web --dir .` to use the real player.',
  );
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(path.dirname(outDir), { recursive: true });
await cp(vendorDir, outDir, {
  recursive: true,
  dereference: true,
  filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`),
});
await patchIndex(outDir);
await patchPlayer(outDir);
console.log(`[showcase] Copied love.js player from ${path.relative(root, vendorDir) || vendorDir}`);

function isLoveJsVendor(dir) {
  return (
    Boolean(dir) &&
    existsSync(path.join(dir, 'index.html')) &&
    (existsSync(path.join(dir, 'player.js')) ||
      existsSync(path.join(dir, 'player.min.js')) ||
      existsSync(path.join(dir, 'love.js')))
  );
}

async function patchPlayer(dir) {
  const bridge = [
    '',
    '// Feather showcase bridge: store postMessage preview payload for love.js.eval() polling',
    'window._featherPayload = null;',
    'window.addEventListener(\'message\', function(e) {',
    '  if (!e.data || e.data.source !== \'feather-showcase\' || e.data.type !== \'preview:update\') return;',
    '  window._featherPayload = e.data.payload || null;',
    '});',
    '',
  ].join('\n');
  const candidates = ['player.min.js', 'player.js'].map((f) => path.join(dir, f));
  const target = candidates.find((f) => existsSync(f));
  if (!target) return;
  const existing = await readFile(target, 'utf8');
  if (existing.includes('_featherPayload')) return;
  await writeFile(target, existing + bridge);
}

async function patchIndex(dir) {
  const indexPath = path.join(dir, 'index.html');
  const playerScript = existsSync(path.join(dir, 'player.min.js')) ? 'player.min.js' : 'player.js';
  const fallback = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Feather love.js Preview</title></head>',
    `<body><canvas id="canvas"></canvas><script src="./${playerScript}?g=showcase.love&v=11.5"></script></body>`,
    '</html>',
    '',
  ].join('\n');

  const existing = existsSync(indexPath) ? await readFile(indexPath, 'utf8') : fallback;
  let next = existing
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Feather love.js Preview</title>')
    .replace(/<base\s+href=["'][^"']*["']\s*\/?>/i, '<base href="./">')
    .replace(/player(?:\.min)?\.js(?:\?g=[^"']*)?/g, `${playerScript}?g=showcase.love&v=11.5`);

  if (!/<title>/i.test(next)) {
    next = next.replace(/<head[^>]*>/i, (match) => `${match}<title>Feather love.js Preview</title>`);
  }
  if (!/\?g=showcase\.love/.test(next)) {
    next = next.replace('</body>', `<script src="./${playerScript}?g=showcase.love&v=11.5"></script></body>`);
  }
  await writeFile(indexPath, next);
}
