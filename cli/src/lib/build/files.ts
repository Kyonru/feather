import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { ResolvedBuildConfig } from './config.js';
import { writeZip, type ZipEntry } from './archive.js';

export type StagedProject = {
  dir: string;
  files: string[];
  cleanup: () => void;
};

function patternToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

function matcher(patterns: string[]): (path: string) => boolean {
  const regexes = patterns.map(patternToRegExp);
  return (path) => regexes.some((regex) => regex.test(path));
}

export function buildSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'game';
}

export function artifactBaseName(config: ResolvedBuildConfig): string {
  return `${buildSlug(config.name)}-${config.version}`;
}

export function listProjectFiles(config: ResolvedBuildConfig): string[] {
  const includes = matcher(config.include);
  const excludes = matcher(config.exclude);
  const files: string[] = [];

  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(config.sourceDir, abs).replace(/\\/g, '/');
      if (!rel || excludes(rel)) continue;
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile() && (config.include.length === 0 || includes(rel))) {
        files.push(rel);
      }
    }
  };

  visit(config.sourceDir);
  return files.sort((a, b) => a.localeCompare(b));
}

export function stageProject(config: ResolvedBuildConfig): StagedProject {
  const root = mkdtempSync(join(tmpdir(), 'feather-build-'));
  const stageDir = join(root, 'game');
  const files = listProjectFiles(config);
  mkdirSync(stageDir, { recursive: true });
  for (const file of files) {
    const src = join(config.sourceDir, file);
    const dest = join(stageDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { force: true });
  }
  return {
    dir: stageDir,
    files,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function zipEntriesFromDir(dir: string): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile()) {
        entries.push({
          name: relative(dir, abs).replace(/\\/g, '/'),
          data: readFileSync(abs),
        });
      }
    }
  };
  visit(dir);
  return entries;
}

export function writeLoveArchive(stageDir: string, outDir: string, basenameWithoutExt: string): string {
  const path = join(outDir, `${basenameWithoutExt}.love`);
  writeZip(path, zipEntriesFromDir(stageDir));
  return path;
}

export function writeDirectoryZip(dir: string, zipPath: string): string {
  writeZip(zipPath, zipEntriesFromDir(dir));
  return zipPath;
}

export function copyDirectory(source: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = relative(source, src).replace(/\\/g, '/');
      return !rel.startsWith('.git');
    },
  });
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function latestManifestPath(outDir: string): string {
  return join(outDir, 'feather-build-manifest.json');
}

export function readLatestManifest(outDir: string): BuildManifest | null {
  const path = latestManifestPath(outDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as BuildManifest;
}

export type BuildArtifact = {
  target: string;
  type: string;
  path: string;
};

export type BuildManifest = {
  name: string;
  version: string;
  target: string;
  createdAt: string;
  artifacts: BuildArtifact[];
};

export function fileSize(path: string): number {
  return statSync(path).size;
}

export function artifactForTarget(manifest: BuildManifest, target: string): BuildArtifact | null {
  const artifacts = manifest.artifacts.filter((artifact) => artifact.target === target && artifact.type !== 'metadata');
  return artifacts.find((artifact) => artifact.type === 'zip')
    ?? artifacts.find((artifact) => artifact.type === 'external')
    ?? artifacts.find((artifact) => artifact.type === 'love')
    ?? null;
}

export function resolveArtifactPath(path: string): string {
  return resolve(path);
}

export function pathName(path: string): string {
  return basename(path);
}
