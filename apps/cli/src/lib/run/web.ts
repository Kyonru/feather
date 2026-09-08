import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import type { BuildArtifact } from '../build/files.js';
import { runBuild } from '../build/build.js';
import type { LoadBuildConfigOptions } from '../build/config.js';
import { printMuted } from '../output.js';

export type WebRunOptions = LoadBuildConfigOptions & {
  clean?: boolean;
  debugger?: boolean;
  runtimeConfigPath?: string;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
  verbose?: boolean;
  host?: string;
  port?: number;
};

export type WebRunResult = {
  target: 'web';
  projectDir: string;
  htmlDir: string;
  url: string;
  host: string;
  port: number;
  debugger: boolean;
  wait: Promise<never>;
};

export async function runWeb(options: WebRunOptions): Promise<WebRunResult> {
  const buildResult = runBuild({
    target: 'web',
    projectDir: options.projectDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
    clean: options.clean,
    allowUnsafe: true,
    embedDebugger: true,
    debugger: options.debugger,
    runtimeConfigPath: options.runtimeConfigPath,
    noPlugins: options.noPlugins,
    featherOverride: options.featherOverride,
    pluginsOverride: options.pluginsOverride,
    verbose: options.verbose,
    log: options.verbose ? printMuted : undefined,
  });

  if (!buildResult.ok) {
    throw new Error(buildResult.error);
  }

  const htmlDir = requireArtifact(buildResult.artifacts, 'html', 'Web HTML');
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 8000;
  const { url, port, close } = process.env.FEATHER_TEST_WEB_RUN_NO_SERVER === '1'
    ? { url: `http://${host}:${requestedPort}/`, port: requestedPort, close: () => {} }
    : await serveStatic(htmlDir, host, requestedPort);

  const shutdown = () => {
    close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return {
    target: 'web',
    projectDir: buildResult.projectDir,
    htmlDir,
    url,
    host,
    port,
    debugger: options.debugger !== false,
    wait: new Promise<never>(() => {}),
  };
}

function requireArtifact(artifacts: BuildArtifact[], type: string, label: string): string {
  const artifact = artifacts.find((item) => item.type === type);
  if (!artifact || !existsSync(artifact.path)) {
    throw new Error(`${label} artifact was not found after build.`);
  }
  return artifact.path;
}

async function serveStatic(root: string, host: string, port: number): Promise<{ url: string; port: number; close: () => void }> {
  const rootPath = resolve(root);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);
    const filePath = resolvePath(rootPath, pathname);
    if (!filePath) {
      respondText(response, 403, 'Forbidden');
      return;
    }

    const target = existsSync(filePath) && statSync(filePath).isDirectory()
      ? join(filePath, 'index.html')
      : filePath;

    if (!existsSync(target) || !statSync(target).isFile()) {
      respondText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, responseHeaders(target));
    createReadStream(target).pipe(response);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}/`,
    port: actualPort,
    close: () => server.close(),
  };
}

function resolvePath(root: string, pathname: string): string | null {
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(root, `.${sep}${normalizedPath}`);
  const rel = relative(root, filePath);
  if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`)) return null;
  return filePath;
}

function respondText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    ...devServerHeaders(),
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(body);
}

function responseHeaders(path: string): Record<string, string> {
  return {
    ...devServerHeaders(),
    'content-type': contentType(path),
  };
}

function devServerHeaders(): Record<string, string> {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: http: https:",
      "worker-src 'self' blob:",
    ].join('; '),
  };
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.wasm': return 'application/wasm';
    case '.data': return 'application/octet-stream';
    case '.mem': return 'application/octet-stream';
    case '.love': return 'application/octet-stream';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}
