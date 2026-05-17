export function fileNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'file.lua';
  } catch {
    return url.split('/').pop() ?? 'file.lua';
  }
}
