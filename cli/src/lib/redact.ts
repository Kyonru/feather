const SENSITIVE_KEY_RE = /^(?:apiKey|api_key|apikey|authorization|password|secret|token)$/i;
const SENSITIVE_ASSIGNMENT_RE =
  /\b(apiKey|api_key|apikey|authorization|password|secret|token)\b(\s*[:=]\s*)(["']?)([^"',\s}\]]+)(\3)/gi;

export function redactSensitiveText(value: string): string {
  return value.replace(SENSITIVE_ASSIGNMENT_RE, (_match, key: string, separator: string, quote: string) => {
    return `${key}${separator}${quote}[redacted]${quote}`;
  });
}

export function redactSensitiveValue<T>(value: T): T {
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : redactSensitiveValue(item);
  }
  return output as T;
}
