import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const GITHUB_RAW =
  "https://raw.githubusercontent.com/Kyonru/feather/{branch}/src-lua/{path}";
const MANIFEST_URL =
  "https://raw.githubusercontent.com/Kyonru/feather/{branch}/src-lua/manifest.txt";

export interface ManifestEntry {
  type: "core" | "plugin";
  path: string;   // for core: "feather/init.lua"
  plugin?: string; // for plugin: plugin id
  sourceDir?: string; // for plugin: directory under plugins/
  file?: string;   // for plugin: filename within plugin dir
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function fetchBinary(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  const ws = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), ws);
}

export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(":");
    if (parts[0] === "core" && parts[1]) {
      entries.push({ type: "core", path: parts[1] });
    } else if (parts[0] === "plugin" && parts[1] && parts[2]) {
      const nestedParts = parts[2].split("/");
      const sourceDir = nestedParts.length > 1 ? `${parts[1]}/${nestedParts.slice(0, -1).join("/")}` : parts[1];
      const file = nestedParts[nestedParts.length - 1];
      const pluginId = sourceDir.replace(/\//g, ".");
      entries.push({
        type: "plugin",
        path: `plugins/${parts[1]}/${parts[2]}`,
        plugin: pluginId,
        sourceDir,
        file,
      });
    }
  }
  return entries;
}

export async function fetchManifest(branch = "main"): Promise<ManifestEntry[]> {
  const url = MANIFEST_URL.replace("{branch}", branch);
  const text = await fetchText(url);
  return parseManifest(text);
}

export async function downloadFile(
  remotePath: string,
  dest: string,
  branch = "main"
): Promise<void> {
  const url = GITHUB_RAW.replace("{branch}", branch).replace("{path}", remotePath);
  await fetchBinary(url, dest);
}

export async function installCore(
  entries: ManifestEntry[],
  targetDir: string,
  branch = "main",
  onProgress?: (file: string) => void,
  installDir = "feather"
): Promise<void> {
  const root = normalizeInstallDir(installDir);
  for (const entry of entries) {
    if (entry.type !== "core") continue;
    const dest = join(targetDir, root, entry.path.replace(/^feather\//, ""));
    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });
    await downloadFile(entry.path, dest, branch);
    onProgress?.(entry.path);
  }
}

export function installCoreFromLocal(
  sourceRoot: string,
  targetDir: string,
  installDir = "feather",
  onProgress?: (file: string) => void
): void {
  const source = join(sourceRoot, "feather");
  if (!existsSync(source)) throw new Error(`No feather core found at ${source}`);

  const root = normalizeInstallDir(installDir);
  const dest = join(targetDir, root);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true, force: true });
  onProgress?.("feather");
}

export function installPluginsFromLocal(
  pluginIds: string[],
  sourceRoot: string,
  targetDir: string,
  installDir = "feather",
  onProgress?: (file: string) => void
): void {
  const pluginsRoot = join(sourceRoot, "plugins");
  if (!existsSync(pluginsRoot)) throw new Error(`No plugins directory found at ${pluginsRoot}`);

  const root = normalizeInstallDir(installDir);
  for (const pluginId of pluginIds) {
    const sourceDir = pluginId.replace(/\./g, "/");
    const source = join(pluginsRoot, sourceDir);
    if (!existsSync(source)) throw new Error(`Unknown plugin: ${pluginId}`);

    const dest = join(targetDir, root, "plugins", sourceDir);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest, { recursive: true, force: true });
    onProgress?.(pluginId);
  }
}

export async function installPlugin(
  pluginId: string,
  entries: ManifestEntry[],
  targetDir: string,
  branch = "main",
  onProgress?: (file: string) => void,
  installDir = "feather"
): Promise<void> {
  const pluginEntries = entries.filter((e) => e.type === "plugin" && e.plugin === pluginId);
  if (pluginEntries.length === 0) throw new Error(`Unknown plugin: ${pluginId}`);
  const root = normalizeInstallDir(installDir);
  for (const entry of pluginEntries) {
    const sourceDir = entry.sourceDir ?? pluginId.replace(/\./g, "/");
    const file = entry.file ?? entry.path.replace(new RegExp(`^plugins/${sourceDir}/`), "");
    const dest = join(targetDir, root, "plugins", sourceDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    await downloadFile(entry.path, dest, branch);
    onProgress?.(entry.path);
  }
}

export function getPluginIds(entries: ManifestEntry[]): string[] {
  return [...new Set(entries.filter((e) => e.type === "plugin").map((e) => e.plugin!))];
}

export function normalizeInstallDir(installDir = "feather"): string {
  return installDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "feather";
}

export function getLocalPluginIds(sourceRoot: string): string[] {
  const pluginsRoot = join(sourceRoot, "plugins");
  if (!existsSync(pluginsRoot)) return [];

  const ids: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(dir, entry.name);
      const manifest = join(pluginDir, "manifest.lua");
      if (existsSync(manifest)) {
        const src = readFileSync(manifest, "utf8");
        const id = src.match(/id\s*=\s*"([^"]+)"/)?.[1];
        if (id) ids.push(id);
      } else {
        visit(pluginDir);
      }
    }
  };

  visit(pluginsRoot);
  return ids.sort();
}
