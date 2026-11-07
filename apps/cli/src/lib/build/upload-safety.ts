import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export type UploadSafetyStatus = 'safe' | 'unsafe' | 'unknown';

export type UploadSafetyResult = {
  status: UploadSafetyStatus;
  artifact: string;
  detectedFiles: string[];
  reason?: string;
};

/**
 * Resource limits for one inspection, shared across every nested archive. Exceeding any of them
 * makes the result `unknown` (which blocks upload unless explicitly overridden) instead of letting
 * a malformed or hostile archive exhaust memory.
 */
export type ArchiveInspectionLimits = {
  /** Entries read across the artifact and every nested archive. */
  maxEntries: number;
  /** Archive bytes read: the artifact itself, nested archive files, and compressed nested entries. */
  maxCompressedBytes: number;
  /** Bytes inflated from nested archive entries. */
  maxExpandedBytes: number;
  /** Largest expanded/compressed ratio allowed for a nested archive entry above `ratioFloorBytes`. */
  maxCompressionRatio: number;
  /** Entries that expand to less than this are exempt from the ratio check. */
  ratioFloorBytes: number;
};

const MiB = 1024 * 1024;
export const DEFAULT_ARCHIVE_INSPECTION_LIMITS: ArchiveInspectionLimits = {
  maxEntries: 200_000,
  maxCompressedBytes: 2048 * MiB,
  maxExpandedBytes: 1024 * MiB,
  maxCompressionRatio: 200,
  ratioFloorBytes: 1 * MiB,
};

export type UploadInspectionOptions = {
  limits?: Partial<ArchiveInspectionLimits>;
};

const FEATHER_PATTERNS = [
  /(?:^|\/)feather(?:\/|$)/,
  /(?:^|\/)plugins(?:\/|$)/,
  /(?:^|\/)\.feather-main\.lua$/,
  /(?:^|\/)feather\.config\.lua$/,
  /(?:^|\/)feather\.debugger\.lua$/,
  /(?:^|\/)feather-build-manifest\.json$/,
  /(?:^|\/)feather_replays(?:\/|$)/,
  /(?:^|\/)[^/]+\.featherreplay$/,
  /(?:^|\/)session-replay(?:\/|$)/,
];
const ZIP_LIKE_EXTENSIONS = new Set(['.aab', '.apk', '.ipa', '.love', '.zip']);
const MAX_NESTED_ARCHIVE_DEPTH = 6;

type ZipEntry = {
  name: string;
  compressedSize: number;
  compressionMethod: number;
  data?: Buffer;
};

class InspectionBudget {
  entries = 0;
  compressedBytes = 0;
  expandedBytes = 0;

  constructor(readonly limits: ArchiveInspectionLimits) {}

  addEntry(): void {
    this.entries += 1;
    if (this.entries > this.limits.maxEntries) {
      throw new Error(`archive inspection limit exceeded: more than ${this.limits.maxEntries} entries`);
    }
  }

  addCompressed(bytes: number, what: string): void {
    this.compressedBytes += bytes;
    if (this.compressedBytes > this.limits.maxCompressedBytes) {
      throw new Error(`archive inspection limit exceeded: ${what} brings archive data read past ${formatBytes(this.limits.maxCompressedBytes)}`);
    }
  }

  reserveExpanded(name: string, compressedSize: number, uncompressedSize: number): void {
    if (
      uncompressedSize >= this.limits.ratioFloorBytes
      && uncompressedSize > compressedSize * this.limits.maxCompressionRatio
    ) {
      throw new Error(
        `archive inspection limit exceeded: ${name} expands ${compressedSize} → ${uncompressedSize} bytes ` +
          `(ratio above ${this.limits.maxCompressionRatio}:1)`,
      );
    }
    this.expandedBytes += uncompressedSize;
    if (this.expandedBytes > this.limits.maxExpandedBytes) {
      throw new Error(`archive inspection limit exceeded: nested archives expand past ${formatBytes(this.limits.maxExpandedBytes)}`);
    }
  }
}

function formatBytes(bytes: number): string {
  return bytes >= MiB ? `${Math.round(bytes / MiB)} MiB` : `${bytes} bytes`;
}

function isFeatherPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.split('!').some((segment) => {
    const archivePath = segment.replace(/^\/+/, '');
    return FEATHER_PATTERNS.some((pattern) => pattern.test(archivePath));
  });
}

function isZipLikePath(path: string): boolean {
  return ZIP_LIKE_EXTENSIONS.has(extname(path).toLowerCase());
}

function inspectNames(artifact: string, names: string[]): UploadSafetyResult {
  const detectedFiles = names.filter(isFeatherPath).sort((a, b) => a.localeCompare(b));
  return {
    status: detectedFiles.length > 0 ? 'unsafe' : 'safe',
    artifact,
    detectedFiles,
  };
}

function readArchiveFile(path: string, budget: InspectionBudget, label: string): Buffer {
  budget.addCompressed(statSync(path).size, label);
  return readFileSync(path);
}

function listInspectableDirectoryNames(root: string, budget: InspectionBudget): string[] {
  const names: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replace(/\\/g, '/');
      budget.addEntry();
      names.push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory()) visit(abs);
      else if (isZipLikePath(entry.name)) {
        names.push(...zipEntryNames(readArchiveFile(abs, budget, rel), budget, rel, 1));
      }
    }
  };
  visit(root);
  return names;
}

function zipEntryNames(zip: Buffer, budget: InspectionBudget, prefix = '', depth = 0): string[] {
  if (depth > MAX_NESTED_ARCHIVE_DEPTH) {
    throw new Error(`nested archive depth exceeded ${MAX_NESTED_ARCHIVE_DEPTH}`);
  }
  const names: string[] = [];
  for (const entry of zipEntries(zip, budget, prefix)) {
    const archiveName = prefix ? `${prefix}!${entry.name}` : entry.name;
    names.push(archiveName);
    if (!entry.name.endsWith('/') && isZipLikePath(entry.name)) {
      if (!entry.data) {
        throw new Error(
          `could not inspect nested archive ${archiveName}: unsupported compression method ${entry.compressionMethod}`,
        );
      }
      names.push(...zipEntryNames(entry.data, budget, archiveName, depth + 1));
    }
  }
  return names;
}

function zipEntries(zip: Buffer, budget: InspectionBudget, prefix: string): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset(zip);
  while (offset + 46 <= zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;
    budget.addEntry();
    const flags = zip.readUInt16LE(offset + 8);
    const compressionMethod = zip.readUInt16LE(offset + 10);
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
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const shouldReadData = !name.endsWith('/') && isZipLikePath(name);
    entries.push({
      name,
      compressedSize,
      compressionMethod,
      data: shouldReadData
        ? readZipEntryData(zip, budget, prefix ? `${prefix}!${name}` : name, {
            compressedSize,
            compressionMethod,
            encrypted: (flags & 0x0001) !== 0,
            localHeaderOffset,
            uncompressedSize,
          })
        : undefined,
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntryData(
  zip: Buffer,
  budget: InspectionBudget,
  label: string,
  entry: {
    compressedSize: number;
    compressionMethod: number;
    encrypted: boolean;
    localHeaderOffset: number;
    uncompressedSize: number;
  },
): Buffer | undefined {
  if (entry.encrypted || (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)) return undefined;
  if (entry.localHeaderOffset + 30 > zip.length) throw new Error('invalid ZIP local header offset');
  const signature = zip.readUInt32LE(entry.localHeaderOffset);
  if (signature !== 0x04034b50) throw new Error('invalid ZIP local header');
  const nameLength = zip.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > zip.length) throw new Error('ZIP entry data extends past archive end');
  budget.addCompressed(entry.compressedSize, label);
  const compressed = zip.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return Buffer.from(compressed);

  // Check the declared size before inflating, then cap the inflater at that size so an entry that
  // lies about its size cannot expand further than the budget already accounted for.
  budget.reserveExpanded(label, entry.compressedSize, entry.uncompressedSize);
  let data: Buffer;
  try {
    data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new Error(`archive inspection limit exceeded: ${label} expands beyond its declared size`, { cause: error });
    }
    throw error;
  }
  if (data.length !== entry.uncompressedSize) {
    throw new Error('ZIP entry size mismatch');
  }
  return data;
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

export function inspectUploadArtifact(artifact: string, options: UploadInspectionOptions = {}): UploadSafetyResult {
  if (!existsSync(artifact)) {
    return {
      status: 'unknown',
      artifact,
      detectedFiles: [],
      reason: 'artifact does not exist',
    };
  }

  const budget = new InspectionBudget({ ...DEFAULT_ARCHIVE_INSPECTION_LIMITS, ...options.limits });
  const stat = statSync(artifact);
  if (stat.isDirectory()) {
    try {
      return inspectNames(artifact, listInspectableDirectoryNames(artifact, budget));
    } catch (error) {
      return {
        status: 'unknown',
        artifact,
        detectedFiles: [],
        reason: `could not inspect directory archive contents: ${(error as Error).message}`,
      };
    }
  }

  const ext = extname(artifact).toLowerCase();
  if (ZIP_LIKE_EXTENSIONS.has(ext)) {
    try {
      return inspectNames(artifact, zipEntryNames(readArchiveFile(artifact, budget, artifact), budget));
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
