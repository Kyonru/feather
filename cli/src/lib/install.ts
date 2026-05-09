import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
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
      entries.push({ type: "plugin", path: `plugins/${parts[1]}/${parts[2]}`, plugin: parts[1], file: parts[2] });
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
  onProgress?: (file: string) => void
): Promise<void> {
  for (const entry of entries) {
    if (entry.type !== "core") continue;
    const dest = join(targetDir, entry.path);
    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });
    await downloadFile(entry.path, dest, branch);
    onProgress?.(entry.path);
  }
}

export async function installPlugin(
  pluginId: string,
  entries: ManifestEntry[],
  targetDir: string,
  branch = "main",
  onProgress?: (file: string) => void
): Promise<void> {
  const pluginEntries = entries.filter((e) => e.type === "plugin" && e.plugin === pluginId);
  if (pluginEntries.length === 0) throw new Error(`Unknown plugin: ${pluginId}`);
  for (const entry of pluginEntries) {
    const dest = join(targetDir, entry.path);
    mkdirSync(dirname(dest), { recursive: true });
    await downloadFile(entry.path, dest, branch);
    onProgress?.(entry.path);
  }
}

export function getPluginIds(entries: ManifestEntry[]): string[] {
  return [...new Set(entries.filter((e) => e.type === "plugin").map((e) => e.plugin!))];
}
