import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin, ViteDevServer } from "vite";

const host = process.env.TAURI_DEV_HOST;
const root = __dirname;

type LoveJsPreviewUtils = {
  buildShowcaseLove: (options: { root: string; outDir: string }) => Promise<void>;
  contentTypeForLoveJsPath: (filePath: string) => string;
  prepareShowcaseLoveJsTarget: (options: {
    root: string;
    outDir: string;
    required?: boolean;
    fetchIfMissing?: boolean;
  }) => Promise<string | null>;
  resolveLoveJsRequest: (outDir: string, rawUrl: string) => Promise<string>;
};

async function loadLoveJsPreviewUtils(): Promise<LoveJsPreviewUtils> {
  const specifier = pathToFileURL(path.join(root, "scripts/showcase-lovejs-utils.mjs")).href;
  return (await import(specifier)) as LoveJsPreviewUtils;
}

function featherLoveJsPreviewPlugin(): Plugin {
  const outDir = path.join(root, ".showcase-dev/showcase-lovejs");
  const buildOutDir = path.join(root, "dist/showcase-lovejs");
  let isBuild = false;
  const luaWatchFiles = [
    path.join(root, "src-lua/example/showcase_preview/main.lua"),
    path.join(root, "src-lua/example/showcase_preview/conf.lua"),
    path.join(root, "src-lua/plugins/shader-graph/preview_runtime.lua"),
  ];
  const luaWatchSet = new Set(luaWatchFiles.map((file) => path.resolve(file)));

  async function prepareForDev(server: ViteDevServer) {
    const {
      buildShowcaseLove,
      contentTypeForLoveJsPath,
      prepareShowcaseLoveJsTarget,
      resolveLoveJsRequest,
    } = await loadLoveJsPreviewUtils();

    let hasRealLoveJs = false;
    try {
      hasRealLoveJs = Boolean(
        await prepareShowcaseLoveJsTarget({
          root,
          outDir,
          required: false,
          fetchIfMissing: process.env.SHOWCASE_LOVEJS_SKIP_FETCH !== "1",
        }),
      );
    } catch (error) {
      server.config.logger.warn(
        `[shader-preview] Could not prepare real love.js preview target: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!hasRealLoveJs) {
      server.config.logger.warn(
        "[shader-preview] Real love.js preview target not available; falling back to public/showcase-lovejs.",
      );
    }

    server.watcher.add(luaWatchFiles);
    server.watcher.on("change", (file) => {
      if (!hasRealLoveJs || !luaWatchSet.has(path.resolve(file))) return;
      buildShowcaseLove({ root, outDir }).catch((error: unknown) => {
        server.config.logger.error(
          `[shader-preview] Failed to rebuild showcase.love: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });

    server.middlewares.use("/showcase-lovejs", async (request, response, next) => {
      try {
        const filePath = await resolveLoveJsRequest(outDir, request.url || "/");
        response.writeHead(200, {
          ...loveJsPreviewHeaders,
          "Content-Type": contentTypeForLoveJsPath(filePath),
          "Cache-Control": "no-store",
        });
        createReadStream(filePath).pipe(response);
      } catch (error) {
        if ((error as { code?: string })?.code === "ENOENT") {
          next();
          return;
        }
        next(error as Error);
      }
    });
  }

  return {
    name: "feather-lovejs-preview",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    async configureServer(server) {
      await prepareForDev(server);
    },
    async closeBundle() {
      if (!isBuild) return;
      const { prepareShowcaseLoveJsTarget } = await loadLoveJsPreviewUtils();
      try {
        const vendor = await prepareShowcaseLoveJsTarget({
          root,
          outDir: buildOutDir,
          required: false,
          fetchIfMissing: false,
        });
        if (!vendor) {
          this.warn(
            "Real love.js preview target not found for build; leaving the lightweight public/showcase-lovejs fallback in place.",
          );
        }
      } catch (error) {
        this.warn(
          `Could not prepare real love.js preview target for build: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}

const loveJsPreviewHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data: ws: ipc:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
};

const viteDevHeaders = {
  ...loveJsPreviewHeaders,
  "Cache-Control": "no-store",
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  cacheDir: "node_modules/.vite/feather-app",
  plugins: [featherLoveJsPreviewPlugin(), react(), tailwindcss()],
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react-router"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
      ignored: ["**/src-tauri/**", "**/.showcase-dev/**"],
    },
    headers: viteDevHeaders,
  },
  preview: {
    headers: loveJsPreviewHeaders,
  },
}));
