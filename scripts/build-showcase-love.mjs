import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const root = process.cwd();
const sourceDir = path.join(root, 'src-lua/example/showcase_preview');
const outDir = path.join(root, 'dist-showcase/showcase-lovejs');

const files = {
  'main.lua': await readFile(path.join(sourceDir, 'main.lua'), 'utf8'),
  'conf.lua': await readFile(path.join(sourceDir, 'conf.lua'), 'utf8'),
};

await mkdir(outDir, { recursive: true });
await copyFile(path.join(root, 'dist-showcase/showcase.html'), path.join(root, 'dist-showcase/index.html'));
await copyFile(path.join(root, 'dist-showcase/showcase.html'), path.join(root, 'dist-showcase/404.html'));
await writeFile(
  path.join(outDir, 'showcase.love'),
  zipSync(
    Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
    { level: 9 },
  ),
);
await writeFile(
  path.join(outDir, 'README.md'),
  [
    '# Feather Showcase Static Build',
    '',
    'This branch contains generated static files for the Feather standalone showcase.',
    '',
    'The `./showcase-lovejs/` path is the isolated LÖVE preview boundary. When replacing the included bridge with the full 2dengine love.js player, serve this path with:',
    '',
    '- `Cross-Origin-Opener-Policy: same-origin`',
    '- `Cross-Origin-Embedder-Policy: require-corp`',
    "- `Content-Security-Policy: script-src 'self' 'unsafe-eval'` or an equivalent policy that allows love.js WASM startup.",
    '',
    'Sources: https://github.com/2dengine/love.js/ and https://2dengine.com/doc/lovejs.html',
    '',
  ].join('\n'),
);
