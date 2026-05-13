import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export type PackageFile = {
  name: string;
  sha256: string;
  target: string;
};

export type SubpackageEntry = {
  files: string[];
  require: string;
  example?: string;
};

export type RegistryEntry = {
  parent?: string;
  type: string;
  trust: "verified" | "known" | "experimental";
  description: string;
  tags: string[];
  homepage?: string;
  license?: string;
  source: {
    repo: string;
    tag: string;
    commitSha?: string;
    baseUrl: string;
  };
  install: { files: PackageFile[] };
  subpackages?: string[];
  require: string;
  example?: string;
};

export type Registry = {
  version: number;
  updatedAt: string;
  packages: Record<string, RegistryEntry>;
};

const REGISTRY_URL =
  "https://raw.githubusercontent.com/Kyonru/feather/packages/registry.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheDir(): string {
  return join(homedir(), ".feather");
}

function cachePath(): string {
  return join(cacheDir(), "registry-cache.json");
}

function bundledRegistryPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "../../generated/registry.json");
}

type CacheFile = { fetchedAt: string; registry: Registry };

function readCache(): Registry | null {
  const path = cachePath();
  if (!existsSync(path)) return null;
  try {
    const { fetchedAt, registry } = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
    if (Date.now() - new Date(fetchedAt).getTime() < CACHE_TTL_MS) return registry;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function writeCache(registry: Registry): void {
  const dir = cacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data: CacheFile = { fetchedAt: new Date().toISOString(), registry };
  writeFileSync(cachePath(), JSON.stringify(data));
}

function readBundled(): Registry {
  return JSON.parse(readFileSync(bundledRegistryPath(), "utf8")) as Registry;
}

export type RegistryLoadOptions = {
  offline?: boolean;
  refresh?: boolean;
  registryUrl?: string;
};

export async function loadRegistry(opts: RegistryLoadOptions = {}): Promise<Registry> {
  if (opts.offline) return readBundled();

  if (!opts.refresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  try {
    const url = opts.registryUrl ?? REGISTRY_URL;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const registry = (await res.json()) as Registry;
    writeCache(registry);
    return registry;
  } catch {
    // Fall through to bundled
  }

  return readBundled();
}
