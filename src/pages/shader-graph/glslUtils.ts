export function glslFloat(n: unknown): string {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value)) return '0.0';
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export function sanitizeGlslIdentifier(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]+/, '');
  return cleaned || fallback;
}

export function shaderTextureUniformName(nodeId: string, configuredName?: unknown): string {
  return sanitizeGlslIdentifier(configuredName, `u_sg_tex_${sanitizeGlslIdentifier(nodeId, 'texture')}`);
}

export function shaderParameterUniformName(nodeId: string, configuredName?: unknown): string {
  const fallback = `u_param_${sanitizeGlslIdentifier(nodeId, 'param')}`;
  const sanitized = sanitizeGlslIdentifier(configuredName, fallback);
  return sanitized.startsWith('u_') ? sanitized : `u_${sanitized}`;
}
