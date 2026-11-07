import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const root = __dirname;

// The love.js preview moved to Feather Studio with the creative tools, so the
// Inspector no longer serves it. These headers stay because the Tauri webview
// still wants a strict policy.
const inspectorHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data: ws: ipc:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
};

const viteDevHeaders = {
  ...inspectorHeaders,
  "Cache-Control": "no-store",
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // The Inspector's own directory is the Vite root now.
  root: path.resolve(__dirname, "apps/inspector"),
  cacheDir: "node_modules/.vite/feather-app",
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react-router"],
  },
  resolve: {
    alias: [
      // Order matters: array aliases are tried top to bottom, and the bare
      // `@feather/ui` entry must not swallow `@feather/ui/<component>`.
      { find: /^@feather\/ui\/hooks\/(.*)$/, replacement: path.resolve(__dirname, './packages/ui/src/hooks/$1') },
      { find: /^@feather\/ui\/theme\/registry$/, replacement: path.resolve(__dirname, './packages/ui/src/theme/registry/index.ts') },
      { find: /^@feather\/ui\/theme\/(.*)$/, replacement: path.resolve(__dirname, './packages/ui/src/theme/$1') },
      { find: /^@feather\/ui$/, replacement: path.resolve(__dirname, './packages/ui/src/index.ts') },
      { find: /^@feather\/ui\/(.*)$/, replacement: path.resolve(__dirname, './packages/ui/src/components/$1') },
      { find: /^@feather\/host\/tauri$/, replacement: path.resolve(__dirname, './packages/host/src/tauri.ts') },
      { find: /^@feather\/host$/, replacement: path.resolve(__dirname, './packages/host/src/index.ts') },
      { find: /^@feather\/session-bridge$/, replacement: path.resolve(__dirname, './packages/session-bridge/src/index.ts') },
      { find: /^@feather\/protocol$/, replacement: path.resolve(__dirname, './packages/protocol/src/index.ts') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './apps/inspector/src/$1') },
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/apps/inspector/src-tauri/**", "**/.showcase-dev/**"],
    },
    headers: viteDevHeaders,
  },
  preview: {
    headers: inspectorHeaders,
  },
}));
