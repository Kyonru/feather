import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export type UploadSafetyStatus = 'safe' | 'unsafe' | 'unknown';

export type UploadSafetyResult = {
  status: UploadSafetyStatus;
  artifact: string;
  detectedFiles: string[];
  reason?: string;
};

const FEATHER_PATTERNS = [
  /^feather(?:\/|$)/,
  /^plugins(?:\/|$)/,
  /^\.feather-main\.lua$/,
  /^feather\.config\.lua$/,
  /^feather\.debugger\.lua$/,
  /^feather-build-manifest\.json$/,
];

function isFeatherPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return FEATHER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function inspectNames(artifact: string, names: string[]): UploadSafetyResult {
  const detectedFiles = names.filter(isFeatherPath).sort((a, b) => a.localeCompare(b));
  return {
    status: detectedFiles.length > 0 ? 'unsafe' : 'safe',
    artifact,
    detectedFiles,
  };
}

function listDirectoryNames(root: string): string[] {
  const names: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replace(/\\/g, '/');
      names.push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory()) visit(abs);
    }
  };
  visit(root);
  return names;
}

function zipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = centralDirectoryOffset(zip);
  while (offset + 46 <= zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported for upload safety inspection.');
    }
    const nameStart = offset + 46;
    names.push(zip.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}

function centralDirectoryOffset(zip: Buffer): number {
  const minOffset = Math.max(0, zip.length - 65557);
  for (let offset = zip.length - 22; offset >= minOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return zip.readUInt32LE(offset + 16);
    }
  }
  throw new Error('central directory not found');
}

export function inspectUploadArtifact(artifact: string): UploadSafetyResult {
  if (!existsSync(artifact)) {
    return {
      status: 'unknown',
      artifact,
      detectedFiles: [],
      reason: 'artifact does not exist',
    };
  }

  const stat = statSync(artifact);
  if (stat.isDirectory()) {
    return inspectNames(artifact, listDirectoryNames(artifact));
  }

  const ext = extname(artifact).toLowerCase();
  if (ext === '.love' || ext === '.zip') {
    try {
      return inspectNames(artifact, zipEntryNames(readFileSync(artifact)));
    } catch (error) {
      return {
        status: 'unknown',
        artifact,
        detectedFiles: [],
        reason: `could not inspect ZIP archive: ${(error as Error).message}`,
      };
    }
  }

  return {
    status: 'unknown',
    artifact,
    detectedFiles: [],
    reason: `artifact type "${ext || 'unknown'}" cannot be safely inspected`,
  };
}

export function uploadSafetyWarning(safety: UploadSafetyResult): string | null {
  if (safety.status === 'safe') return null;
  if (safety.status === 'unsafe') {
    return `Feather runtime/debugging files were detected in ${safety.artifact}.`;
  }
  return `Feather could not verify whether ${safety.artifact} contains runtime/debugging files.`;
}
