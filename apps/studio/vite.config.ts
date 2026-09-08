import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const root = __dirname;
const repo = path.resolve(root, '../..');

// Feather Studio's own build. Separate output, separate dev port, and
// deliberately no alias back into the Inspector's `src/` — Studio consumes only
// the shared packages. If an import of Inspector code ever appears here, the
// build fails to resolve rather than quietly recreating the coupling.
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@feather\/ui\/hooks\/(.*)$/, replacement: path.resolve(repo, 'packages/ui/src/hooks/$1') },
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
  server: {
    port: 1430,
    strictPort: true,
  },
});
