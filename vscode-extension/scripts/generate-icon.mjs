import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');
const repoRoot = join(extensionRoot, '..');
const source = join(repoRoot, 'public', 'feather.svg');
const output = join(extensionRoot, 'icon.png');
const size = 128;

const svg = readFileSync(source, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: size, height: size },
  deviceScaleFactor: 1,
});

await page.setContent(
  `<!doctype html>
  <html>
    <head>
      <style>
        html, body {
          width: ${size}px;
          height: ${size}px;
          margin: 0;
          background: transparent;
          overflow: hidden;
        }
        svg {
          width: ${size}px;
          height: ${size}px;
          display: block;
        }
      </style>
    </head>
    <body>${svg}</body>
  </html>`,
);

mkdirSync(extensionRoot, { recursive: true });
await page.screenshot({ path: output, omitBackground: true });
await browser.close();
