import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

function showcaseLoveJsDevPlugin() {
  const root = __dirname;
  const outDir = path.join(root, '.showcase-dev/showcase-lovejs');
  const showcaseHtml = path.join(root, 'showcase.html');
  const luaWatchFiles = [
    path.join(root, 'src-lua/example/showcase_preview/main.lua'),
    path.join(root, 'src-lua/example/showcase_preview/conf.lua'),
    path.join(root, 'src-lua/plugins/shader-graph/preview_runtime.lua'),
  ];

  return {
    name: 'feather-showcase-lovejs-dev',
    apply: 'serve' as const,
    async configureServer(server: import('vite').ViteDevServer) {
      const {
        buildShowcaseLove,
        contentTypeForLoveJsPath,
        prepareShowcaseLoveJsTarget,
        resolveLoveJsRequest,
      } = await import('./scripts/showcase-lovejs-utils.mjs');

      await prepareShowcaseLoveJsTarget({
        root,
        outDir,
        required: true,
        fetchIfMissing: process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== '1',
      });

      server.watcher.add(luaWatchFiles);
      server.watcher.on('change', (file) => {
        if (!luaWatchFiles.includes(path.resolve(file))) return;
        buildShowcaseLove({ root, outDir }).catch((error: unknown) => {
          server.config.logger.error(
            `[showcase] Failed to rebuild showcase.love: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      });

      server.middlewares.use('/showcase-lovejs', async (request, response, next) => {
        try {
          const filePath = await resolveLoveJsRequest(outDir, request.url || '/');
          response.writeHead(200, {
            'Content-Type': contentTypeForLoveJsPath(filePath),
            'Cache-Control': filePath.endsWith('.html') || filePath.endsWith('.love') ? 'no-cache' : 'public, max-age=3600',
          });
          createReadStream(filePath).pipe(response);
        } catch (error) {
          if ((error as { code?: string })?.code === 'ENOENT') {
            next();
            return;
          }
          next(error as Error);
        }
      });

      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (pathname.startsWith('/@') || pathname.startsWith('/src/') || path.extname(pathname)) {
          next();
          return;
        }

        try {
          const html = await readFile(showcaseHtml, 'utf8');
          const transformed = await server.transformIndexHtml(request.url || '/', html);
          response.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          });
          response.end(transformed);
        } catch (error) {
          next(error as Error);
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [showcaseLoveJsDevPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-showcase',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'showcase.html'),
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/.showcase-dev/**'],
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data: ws:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
    },
  },
});
