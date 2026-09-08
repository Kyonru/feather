export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function buildCommand(executable: string, script: string, args: string[]): string {
  return [executable, script, ...args].map(shellQuote).join(' ');
}

export function buildEnvCommand(env: Record<string, string>, executable: string, script: string, args: string[]): string {
  const assignments = Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`);
  return [...assignments, executable, script, ...args].map((value, index) => (
    index < assignments.length ? value : shellQuote(value)
  )).join(' ');
}
