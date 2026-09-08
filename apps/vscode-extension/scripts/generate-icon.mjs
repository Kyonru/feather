/* eslint-disable no-undef */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');
const repoRoot = join(extensionRoot, '..');
const source = join(repoRoot, 'public', 'feather.svg');
const output = join(extensionRoot, 'icon.png');
const size = 128;

mkdirSync(extensionRoot, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.error || result.status !== 0) {
    return false;
  }
  return true;
}

if (run('rsvg-convert', ['--width', String(size), '--height', String(size), '--output', output, source])) {
  process.exit(0);
}

if (run('magick', [source, '-background', 'none', '-resize', `${size}x${size}`, output])) {
  process.exit(0);
}

if (run('convert', [source, '-background', 'none', '-resize', `${size}x${size}`, output])) {
  process.exit(0);
}

try {
  const svg = readFileSync(source, 'utf8');
  const { chromium } = await import('playwright');
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

  await page.screenshot({ path: output, omitBackground: true });
  await browser.close();
} catch (error) {
  console.error('Failed to generate vscode-extension/icon.png.');
  console.error(
    'Install one of: librsvg2-bin/rsvg-convert, ImageMagick, or Playwright browsers with `npx playwright install chromium`.',
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
