/* eslint-disable no-undef */
/**
 * Put the love.js preview target into an application's build output.
 *
 * The showcase had this as two build steps hardcoded to `dist-showcase/`, which
 * is why Studio shipped without one: Studio owns the shader-graph and particle
 * previews, but its build produced only `index.html` and `assets/`, so every
 * preview iframe in the packaged app requested a path that did not exist and
 * fell back to the SPA shell — the application rendering inside itself.
 *
 * Takes the output directory as an argument so any app can run it.
 *
 *   node scripts/prepare-lovejs-dist.mjs apps/studio/dist/showcase-lovejs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareShowcaseLoveJsTarget, buildShowcaseLove } from './showcase-lovejs-utils.mjs';

// Anchored to this file, not to `process.cwd()`. pnpm runs a workspace script
// from that package's directory, so a cwd-relative root resolves to
// apps/studio/apps/studio/... and silently finds nothing.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (!target) {
  console.error('usage: node scripts/prepare-lovejs-dist.mjs <out-dir>');
  process.exit(1);
}

// Relative paths are repo-relative for the same reason.
const outDir = path.isAbsolute(target) ? target : path.join(root, target);

const vendorDir = await prepareShowcaseLoveJsTarget({
  root,
  outDir,
  required: false,
  fetchIfMissing: process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== '1',
});

if (vendorDir) {
  console.log(`[lovejs] Player from ${path.relative(root, vendorDir) || vendorDir}`);
} else {
  console.warn('[lovejs] Real love.js player not found; keeping the bridge preview from public/showcase-lovejs/.');
  console.warn('[lovejs] Set SHOWCASE_LOVEJS_DIR=/path/to/love.js or run `feather build vendor add web --dir .`.');
}

await buildShowcaseLove({ root, outDir });
console.log(`[lovejs] Preview target ready at ${path.relative(root, outDir)}`);
