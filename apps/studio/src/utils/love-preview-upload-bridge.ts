type UploadPayload = Record<string, unknown> & {
  filename?: string;
  uniform?: string;
  dataBase64?: string;
  dataKey?: string;
  dataLength?: number;
};

type PreviewWindow = Window & {
  __featherPreviewUploadCache?: Record<string, string>;
  __featherPreviewUploadCacheBytes?: number;
  __featherPreviewUploadChunk?: (key: string, start: number, length: number) => string;
};

const MAX_PREVIEW_UPLOAD_CACHE_CHARS = 128 * 1024 * 1024;

function previewWindow(): PreviewWindow | null {
  return typeof window === 'undefined' ? null : (window as PreviewWindow);
}

function ensureUploadCache(): PreviewWindow | null {
  const target = previewWindow();
  if (!target) return null;
  target.__featherPreviewUploadCache ??= Object.create(null) as Record<string, string>;
  target.__featherPreviewUploadChunk ??= (key: string, start: number, length: number) => {
    const data = target.__featherPreviewUploadCache?.[String(key)] ?? '';
    const offset = Number(start) || 0;
    return data.slice(offset, offset + (Number(length) || 0));
  };
  return target;
}

function stripUpload(upload: unknown, fallbackKey: string): unknown {
  if (!upload || typeof upload !== 'object') return upload;
  const item = upload as UploadPayload;
  if (typeof item.dataBase64 !== 'string' || item.dataBase64.length === 0) return upload;

  const target = ensureUploadCache();
  if (!target?.__featherPreviewUploadCache) return upload;

  const key = [
    fallbackKey,
    typeof item.uniform === 'string' ? item.uniform : '',
    typeof item.filename === 'string' ? item.filename : '',
    item.dataBase64.length,
    item.dataBase64.slice(0, 16),
    item.dataBase64.slice(-16),
  ].join(':');
  const cache = target.__featherPreviewUploadCache;
  target.__featherPreviewUploadCacheBytes ??= Object.values(cache).reduce((total, value) => total + value.length, 0);
  if (item.dataBase64.length > MAX_PREVIEW_UPLOAD_CACHE_CHARS) return upload;
  if (cache[key] === undefined) {
    while (target.__featherPreviewUploadCacheBytes + item.dataBase64.length > MAX_PREVIEW_UPLOAD_CACHE_CHARS) {
      const oldestKey = Object.keys(cache)[0];
      if (!oldestKey) break;
      target.__featherPreviewUploadCacheBytes -= cache[oldestKey].length;
      delete cache[oldestKey];
    }
    if (target.__featherPreviewUploadCacheBytes + item.dataBase64.length > MAX_PREVIEW_UPLOAD_CACHE_CHARS) return upload;
    target.__featherPreviewUploadCacheBytes += item.dataBase64.length;
  }
  cache[key] = item.dataBase64;

  return {
    ...item,
    dataBase64: '',
    dataKey: key,
    dataLength: item.dataBase64.length,
  };
}

type StripLovePreviewUploadsOptions = {
  stripBaseTexture?: boolean;
  stripTextures?: boolean;
};

export function stripLovePreviewUploads<T extends Record<string, unknown>>(
  payload: T,
  options: StripLovePreviewUploadsOptions = {},
): T {
  const stripBaseTexture = options.stripBaseTexture ?? true;
  const stripTextures = options.stripTextures ?? true;
  const next: Record<string, unknown> = {
    ...payload,
    baseTexture: stripBaseTexture ? stripUpload(payload.baseTexture, 'baseTexture') : payload.baseTexture,
  };
  if (Array.isArray(payload.textures)) {
    next.textures = stripTextures
      ? payload.textures.map((upload, index) => stripUpload(upload, `texture-${index}`))
      : payload.textures;
  }
  const composite = payload.composite;
  if (composite && typeof composite === 'object' && !Array.isArray(composite)) {
    const value = composite as Record<string, unknown>;
    if (Array.isArray(value.systems)) {
      next.composite = {
        ...value,
        systems: value.systems.map((system, index) => {
          if (!system || typeof system !== 'object' || Array.isArray(system)) return system;
          const item = system as Record<string, unknown>;
          if (typeof item.textureAssetBase64 !== 'string' || item.textureAssetBase64.length === 0) return system;
          const upload = stripUpload(
            { filename: item.textureFilename, dataBase64: item.textureAssetBase64 },
            `particle-texture-${index}`,
          ) as UploadPayload;
          return {
            ...item,
            textureAssetBase64: upload.dataBase64,
            textureAssetDataKey: upload.dataKey,
            textureAssetDataLength: upload.dataLength,
          };
        }),
      };
    }
  }
  return next as T;
}
