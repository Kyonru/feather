/* eslint-disable no-undef */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildShowcaseLove } from './showcase-lovejs-utils.mjs';

const root = process.cwd();
const outDir = path.join(root, 'dist-showcase/showcase-lovejs');

await mkdir(outDir, { recursive: true });
await copyFile(path.join(root, 'dist-showcase/showcase.html'), path.join(root, 'dist-showcase/index.html'));
await copyFile(path.join(root, 'dist-showcase/showcase.html'), path.join(root, 'dist-showcase/404.html'));
await buildShowcaseLove({ root, outDir });
await writeFile(
  path.join(outDir, 'README.md'),
  [
    '# Feather Showcase Static Build',
    '',
    'This branch contains generated static files for the Feather standalone showcase.',
    '',
    'The `./showcase-lovejs/` path is the isolated LÖVE preview boundary. Serve this path with:',
    '',
    '- `Cross-Origin-Opener-Policy: same-origin`',
    '- `Cross-Origin-Embedder-Policy: require-corp`',
    "- `Content-Security-Policy: script-src 'self' 'unsafe-eval'` or an equivalent policy that allows love.js WASM startup.",
    '',
    'Sources: https://github.com/2dengine/love.js/ and https://2dengine.com/doc/lovejs.html',
    '',
  ].join('\n'),
);
