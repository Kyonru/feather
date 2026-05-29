type UploadPayload = Record<string, unknown> & {
  filename?: string;
  uniform?: string;
  dataBase64?: string;
  dataKey?: string;
  dataLength?: number;
};

type PreviewWindow = Window & {
  __featherPreviewUploadCache?: Record<string, string>;
  __featherPreviewUploadChunk?: (key: string, start: number, length: number) => string;
};

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
  target.__featherPreviewUploadCache[key] = item.dataBase64;

  return {
    ...item,
    dataBase64: '',
    dataKey: key,
    dataLength: item.dataBase64.length,
  };
}

export function stripLovePreviewUploads<T extends Record<string, unknown>>(payload: T): T {
  const next: Record<string, unknown> = {
    ...payload,
    baseTexture: stripUpload(payload.baseTexture, 'baseTexture'),
  };
  if (Array.isArray(payload.textures)) {
    next.textures = payload.textures.map((upload, index) => stripUpload(upload, `texture-${index}`));
  }
  return next as T;
}
