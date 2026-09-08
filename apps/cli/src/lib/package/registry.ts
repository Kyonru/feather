import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveProjectTarget } from "./target.js";

export type PackageFile = {
  name: string;
  url?: string;
  sha256: string;
  target: string;
};

export type PackageLicenseFile = {
  name: string;
  sha256: string;
  target?: string;
};

export type PackageDependencyAlias = {
  dependency: string;
  target: string;
  require?: string;
};

export type SubpackageEntry = {
  files: string[];
  require: string;
  example?: string;
  dependencies?: string[];
  dependencyAliases?: PackageDependencyAlias[];
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
    type?: string;
    repo?: string;
    tag?: string;
    commitSha?: string;
    resolvedRef?: string;
    baseUrl?: string;
    transport?: "raw" | "git";
  };
  install: { layout?: "relocatable" | "fixed"; files: PackageFile[]; licenses?: PackageLicenseFile[] };
  dependencies?: string[];
  dependencyAliases?: PackageDependencyAlias[];
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
const TRUST_VALUES = new Set(["verified", "known", "experimental"]);
const SHA256_RE = /^[a-f0-9]{64}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePackageId(id: string): void {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(id)) throw new Error(`Invalid package id: ${id}`);
}

export function validateRegistry(value: unknown): Registry {
  if (!isObject(value)) throw new Error("Registry must be an object");
  if (value.version !== 1) throw new Error("Registry version must be 1");
  if (typeof value.updatedAt !== "string") throw new Error("Registry updatedAt must be a string");
  if (!isObject(value.packages)) throw new Error("Registry packages must be an object");

  const packages = value.packages as Record<string, RegistryEntry>;
  for (const [id, entry] of Object.entries(packages)) {
    validatePackageId(id);
    if (!isObject(entry)) throw new Error(`Package ${id} must be an object`);
    if (entry.parent !== undefined && typeof entry.parent !== "string") throw new Error(`Package ${id} parent must be a string`);
    if (entry.parent && !packages[entry.parent]) throw new Error(`Package ${id} parent ${entry.parent} is missing`);
    if (typeof entry.type !== "string") throw new Error(`Package ${id} type is required`);
    if (!TRUST_VALUES.has(entry.trust)) throw new Error(`Package ${id} has invalid trust`);
    if (typeof entry.description !== "string") throw new Error(`Package ${id} description is required`);
    if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string")) {
      throw new Error(`Package ${id} tags must be strings`);
    }
    if (!isObject(entry.source)) throw new Error(`Package ${id} source is required`);
    if (entry.source.transport !== undefined && entry.source.transport !== "raw" && entry.source.transport !== "git") {
      throw new Error(`Package ${id} source.transport must be "raw" or "git"`);
    }
    const gitTransport = entry.source.transport === "git";
    if (typeof entry.source.repo !== "string" || (!gitTransport && !/^[^/]+\/[^/]+$/.test(entry.source.repo))) {
      throw new Error(`Package ${id} source.repo must be owner/repo`);
    }
    if (typeof entry.source.tag !== "string" || !entry.source.tag) throw new Error(`Package ${id} source.tag is required`);
    const baseUrl = entry.source.baseUrl;
    if (!gitTransport && (typeof baseUrl !== "string" || !baseUrl.startsWith("https://raw.githubusercontent.com/"))) {
      throw new Error(`Package ${id} source.baseUrl must be a raw GitHub URL`);
    }
    if (typeof entry.source.commitSha !== "string" || !/^[a-f0-9]{40}$/i.test(entry.source.commitSha)) {
      throw new Error(`Package ${id} source.commitSha must be a 40-character SHA`);
    }
    if (entry.source.resolvedRef !== undefined && typeof entry.source.resolvedRef !== "string") {
      throw new Error(`Package ${id} source.resolvedRef must be a string`);
    }
    if (!gitTransport && !baseUrl!.includes(entry.source.commitSha)) {
      throw new Error(`Package ${id} source.baseUrl must include source.commitSha`);
    }
    if (!isObject(entry.install) || !Array.isArray(entry.install.files) || entry.install.files.length === 0) {
      throw new Error(`Package ${id} install.files is required`);
    }
    if (entry.install.layout !== undefined && entry.install.layout !== "relocatable" && entry.install.layout !== "fixed") {
      throw new Error(`Package ${id} install.layout must be "relocatable" or "fixed"`);
    }
    for (const file of entry.install.files) {
      if (!isObject(file)) throw new Error(`Package ${id} install file must be an object`);
      if (typeof file.name !== "string" || !file.name) throw new Error(`Package ${id} file.name is required`);
      if (typeof file.target !== "string" || !resolveProjectTarget("/project", file.target)) {
        throw new Error(`Package ${id} file target escapes project root: ${file.target}`);
      }
      if (typeof file.sha256 !== "string" || !SHA256_RE.test(file.sha256)) {
        throw new Error(`Package ${id} file ${file.name} has invalid sha256`);
      }
      if (file.url !== undefined && typeof file.url !== "string") throw new Error(`Package ${id} file.url must be a string`);
    }
    if (entry.install.licenses !== undefined) {
      if (!Array.isArray(entry.install.licenses)) throw new Error(`Package ${id} install.licenses must be an array`);
      for (const license of entry.install.licenses) {
        if (!isObject(license)) throw new Error(`Package ${id} license file must be an object`);
        if (typeof license.name !== "string" || !license.name) throw new Error(`Package ${id} license.name is required`);
        if (typeof license.sha256 !== "string" || !SHA256_RE.test(license.sha256)) {
          throw new Error(`Package ${id} license ${license.name} has invalid sha256`);
        }
        if (license.target !== undefined && (typeof license.target !== "string" || !resolveProjectTarget("/project", license.target))) {
          throw new Error(`Package ${id} license target escapes project root: ${license.target}`);
        }
      }
    }
    if (typeof entry.require !== "string" || !entry.require) throw new Error(`Package ${id} require is required`);
    if (entry.dependencies !== undefined) {
      if (!Array.isArray(entry.dependencies) || entry.dependencies.some((dependency) => typeof dependency !== "string" || !dependency)) {
        throw new Error(`Package ${id} dependencies must be non-empty strings`);
      }
      for (const dependency of entry.dependencies) {
        if (!packages[dependency]) throw new Error(`Package ${id} dependency ${dependency} is missing`);
      }
    }
    if (entry.dependencyAliases !== undefined) {
      if (!Array.isArray(entry.dependencyAliases)) throw new Error(`Package ${id} dependencyAliases must be an array`);
      for (const alias of entry.dependencyAliases) {
        if (!isObject(alias)) throw new Error(`Package ${id} dependencyAlias must be an object`);
        if (typeof alias.dependency !== "string" || !alias.dependency) {
          throw new Error(`Package ${id} dependencyAlias.dependency is required`);
        }
        if (!packages[alias.dependency]) throw new Error(`Package ${id} dependencyAlias dependency ${alias.dependency} is missing`);
        if (!entry.dependencies?.includes(alias.dependency)) {
          throw new Error(`Package ${id} dependencyAlias ${alias.dependency} must also be listed in dependencies`);
        }
        if (typeof alias.target !== "string" || !alias.target.endsWith(".lua") || !resolveProjectTarget("/project", alias.target)) {
          throw new Error(`Package ${id} dependencyAlias target must be a safe .lua path`);
        }
        if (alias.require !== undefined && (typeof alias.require !== "string" || !alias.require)) {
          throw new Error(`Package ${id} dependencyAlias require must be a non-empty string`);
        }
      }
    }
    if (entry.subpackages?.some((subpackage) => typeof subpackage !== "string" || packages[subpackage]?.parent !== id)) {
      throw new Error(`Package ${id} has invalid subpackage references`);
    }
  }

  return value as Registry;
}

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
    if (Date.now() - new Date(fetchedAt).getTime() < CACHE_TTL_MS) return validateRegistry(registry);
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
  return validateRegistry(JSON.parse(readFileSync(bundledRegistryPath(), "utf8")));
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
    const registry = validateRegistry(await res.json());
    writeCache(registry);
    return registry;
  } catch {
    // Fall through to bundled
  }

  return readBundled();
}
