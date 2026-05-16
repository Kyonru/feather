import { isAbsolute, relative, resolve } from "node:path";

export function resolveProjectTarget(projectDir: string, target: string): string | null {
  if (!target || isAbsolute(target)) return null;

  const root = resolve(projectDir);
  const absoluteTarget = resolve(root, target);
  const relativeTarget = relative(root, absoluteTarget);

  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) return null;
  return absoluteTarget;
}

