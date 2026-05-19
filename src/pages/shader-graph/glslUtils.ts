export function glslFloat(n: unknown): string {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value)) return '0.0';
  return Number.isInteger(value) ? `${value}.0` : String(value);
}
