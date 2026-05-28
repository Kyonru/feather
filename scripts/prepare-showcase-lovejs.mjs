/* eslint-disable no-undef */
import path from 'node:path';
import { prepareShowcaseLoveJsTarget } from './showcase-lovejs-utils.mjs';

const root = process.cwd();
const outDir = path.join(root, 'dist-showcase/showcase-lovejs');

try {
  const vendorDir = await prepareShowcaseLoveJsTarget({
    root,
    outDir,
    required: false,
    fetchIfMissing: process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== '1',
  });
  if (vendorDir) {
    console.log(`[showcase] Copied love.js player from ${path.relative(root, vendorDir) || vendorDir}`);
  } else {
    console.warn('[showcase] Real love.js player not found; keeping the bridge preview from public/showcase-lovejs/.');
    console.warn(
      '[showcase] Set SHOWCASE_LOVEJS_DIR=/path/to/love.js or run `feather build vendor add web --dir .` to use the real player.',
    );
  }
} catch (error) {
  console.warn(`[showcase] Could not prepare love.js preview: ${error instanceof Error ? error.message : String(error)}`);
}
