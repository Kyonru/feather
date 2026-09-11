import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { loveJsPreviewPlugin, loveJsDevHeaders, loveJsPreviewHeaders } from '../../scripts/vite-lovejs-plugin.mjs';

const root = __dirname;
const repo = path.resolve(root, '../..');

// Feather Studio's own build. Separate output, separate dev port, and
// deliberately no alias back into the Inspector's `src/` — Studio consumes only
// the shared packages. If an import of Inspector code ever appears here, the
// build fails to resolve rather than quietly recreating the coupling.
export default defineConfig({
  root,
  // Studio owns the shader-graph and particle previews, so it is the plugin's
  // primary consumer — its own docstring says so. It was never actually wired
  // up here, which meant every love.js preview iframe requested a path Vite did
  // not serve, fell through to the SPA fallback, and rendered Studio inside
  // itself. `required` because a Studio without previews is not Studio.
  plugins: [loveJsPreviewPlugin({ repoRoot: repo, required: true }), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@studio\/(.*)$/, replacement: path.resolve(root, 'src/$1') },
      { find: /^@feather\/ui\/hooks\/(.*)$/, replacement: path.resolve(repo, 'packages/ui/src/hooks/$1') },
      { find: /^@feather\/ui\/theme\/registry$/, replacement: path.resolve(repo, 'packages/ui/src/theme/registry/index.ts') },
      { find: /^@feather\/ui\/theme\/(.*)$/, replacement: path.resolve(repo, 'packages/ui/src/theme/$1') },
      { find: /^@feather\/ui$/, replacement: path.resolve(repo, 'packages/ui/src/index.ts') },
      { find: /^@feather\/ui\/(.*)$/, replacement: path.resolve(repo, 'packages/ui/src/components/$1') },
      { find: /^@feather\/host\/tauri$/, replacement: path.resolve(repo, 'packages/host/src/tauri.ts') },
      { find: /^@feather\/host$/, replacement: path.resolve(repo, 'packages/host/src/index.ts') },
      { find: /^@feather\/session-bridge$/, replacement: path.resolve(repo, 'packages/session-bridge/src/index.ts') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  clearScreen: false,
  // Bound explicitly: pnpm passes `--` through literally, so a CLI --host never
  // reaches Vite and the Playwright suite could not reach the server.
  server: {
    host: '127.0.0.1',
    port: 1430,
    strictPort: true,
    // love.js needs cross-origin isolation to start its WASM runtime.
    headers: loveJsDevHeaders,
  },
  preview: { headers: loveJsPreviewHeaders },
});
