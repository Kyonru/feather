import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
// @ts-expect-error -- plain .mjs helper shared with Studio's own config
import { loveJsPreviewPlugin, loveJsDevHeaders, loveJsPreviewHeaders } from '../../scripts/vite-lovejs-plugin.mjs';

const root = __dirname;
const repoRoot = path.resolve(root, '../..');

/**
 * The showcase: Feather Studio running in a browser.
 *
 * A thin shell. It owns no page code — it mounts Studio's web entry with the web
 * host and no session bridge, which is the standalone case Studio already
 * supports. This replaces the root `vite.showcase.config.ts`, which duplicated
 * the Inspector's love.js middleware and CSP block and had begun to drift from it.
 */
export default defineConfig({
  root,
  base: './',
  cacheDir: path.join(repoRoot, 'node_modules/.vite/feather-showcase'),
  plugins: [loveJsPreviewPlugin({ repoRoot, required: true }), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@studio\/(.*)$/, replacement: path.resolve(repoRoot, 'apps/studio/src/$1') },
      { find: /^@feather\/ui\/hooks\/(.*)$/, replacement: path.resolve(repoRoot, 'packages/ui/src/hooks/$1') },
      { find: /^@feather\/ui$/, replacement: path.resolve(repoRoot, 'packages/ui/src/index.ts') },
      { find: /^@feather\/ui\/(.*)$/, replacement: path.resolve(repoRoot, 'packages/ui/src/components/$1') },
      { find: /^@feather\/host$/, replacement: path.resolve(repoRoot, 'packages/host/src/index.ts') },
      { find: /^@feather\/session-bridge$/, replacement: path.resolve(repoRoot, 'packages/session-bridge/src/index.ts') },
    ],
  },
  build: {
    outDir: path.join(repoRoot, 'dist-showcase'),
    emptyOutDir: true,
  },
  // Studio's source lives outside this root, so Vite must be allowed to serve it.
  server: { port: 5174, strictPort: true, headers: loveJsDevHeaders, fs: { allow: [repoRoot] } },
  preview: { port: 4174, strictPort: true, headers: loveJsPreviewHeaders },
});
