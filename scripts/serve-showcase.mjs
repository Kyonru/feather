/* eslint-disable no-undef */
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'dist-showcase');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.love', 'application/octet-stream'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.worker.js', 'text/javascript; charset=utf-8'],
]);

const sharedHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
};

if (!existsSync(publicDir)) {
  console.error('[showcase] dist-showcase does not exist. Run `npm run showcase:build` before starting the server.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolvePath(request.url || '/');
    const extension = path.extname(filePath);
    const type = filePath.endsWith('.worker.js')
      ? contentTypes.get('.worker.js')
      : contentTypes.get(extension) || 'application/octet-stream';

    response.writeHead(200, {
      ...sharedHeaders,
      'Content-Type': type,
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : 500;
    response.writeHead(status, {
      ...sharedHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    response.end(status === 404 ? 'Not found\n' : 'Internal server error\n');
  }
});

server.listen(port, host, () => {
  console.log(`[showcase] Serving ${publicDir} on http://${host}:${port}`);
});

async function resolvePath(rawUrl) {
  const pathname = new URL(rawUrl, 'http://localhost').pathname;
  const decoded = decodeURIComponent(pathname);
  const requested = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const candidate = path.resolve(publicDir, `.${requested}`);

  if (!candidate.startsWith(`${publicDir}${path.sep}`) && candidate !== publicDir) {
    const error = new Error('Path escapes public directory');
    error.code = 'ENOENT';
    throw error;
  }

  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
  } catch {
    // Fall through to SPA fallback.
  }

  if (!path.extname(candidate)) {
    const fallback = path.join(publicDir, 'index.html');
    if (existsSync(fallback)) return fallback;
  }

  const error = new Error('File not found');
  error.code = 'ENOENT';
  throw error;
}
