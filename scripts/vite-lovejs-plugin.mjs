/**
 * The love.js preview target, as one Vite plugin.
 *
 * This logic used to exist twice — in the Inspector's Vite config and again in
 * the showcase's — with the same CSP block, the same `/showcase-lovejs`
 * middleware and the same Lua watch list copied between them. They had already
 * started to drift.
 *
 * It now has one home. The Inspector no longer needs it at all: the shader graph
 * and particle previews moved to Feather Studio, so only Studio and the showcase
 * consume this.
 */
import { createReadStream } from 'node:fs';
import path from 'node:path';

export const loveJsPreviewHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data: ws:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
};

export const loveJsDevHeaders = {
  ...loveJsPreviewHeaders,
  'Cache-Control': 'no-store',
};

/**
 * @param {object} options
 * @param {string} options.repoRoot  Repository root, used to locate the Lua sources.
 * @param {boolean} [options.required] Fail startup when the real target is missing.
 */
export function loveJsPreviewPlugin({ repoRoot, required = false }) {
  const outDir = path.join(repoRoot, '.showcase-dev/showcase-lovejs');
  const luaWatchFiles = [
    path.join(repoRoot, 'packages/runtime-lua/example/showcase_preview/main.lua'),
    path.join(repoRoot, 'packages/runtime-lua/example/showcase_preview/conf.lua'),
    path.join(repoRoot, 'packages/runtime-lua/plugins/shader-graph/preview_runtime.lua'),
  ];

  return {
    name: 'feather-lovejs-preview',
    apply: 'serve',
    async configureServer(server) {
      const {
        buildShowcaseLove,
        contentTypeForLoveJsPath,
        prepareShowcaseLoveJsTarget,
        resolveLoveJsRequest,
      } = await import(path.join(repoRoot, 'scripts/showcase-lovejs-utils.mjs'));

      await prepareShowcaseLoveJsTarget({
        root: repoRoot,
        outDir,
        required,
        fetchIfMissing: process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== '1',
      });

      server.watcher.add(luaWatchFiles);
      server.watcher.on('change', (file) => {
        if (!luaWatchFiles.includes(path.resolve(file))) return;
        buildShowcaseLove({ root: repoRoot, outDir }).catch((error) => {
          server.config.logger.error(
            `[lovejs] Failed to rebuild showcase.love: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      });

      server.middlewares.use('/showcase-lovejs', async (request, response, next) => {
        try {
          const filePath = await resolveLoveJsRequest(outDir, request.url || '/');
          response.writeHead(200, {
            ...loveJsPreviewHeaders,
            'Content-Type': contentTypeForLoveJsPath(filePath),
            'Cache-Control': 'no-store',
          });
          createReadStream(filePath).pipe(response);
        } catch (error) {
          if (error?.code === 'ENOENT') {
            next();
            return;
          }
          next(error);
        }
      });
    },
  };
}
