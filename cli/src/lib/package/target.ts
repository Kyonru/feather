import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { assertNoSymlinkEscape } from "../path-safety.js";

export function resolveProjectTarget(projectDir: string, target: string): string | null {
  if (!target || isAbsolute(target)) return null;

  const root = resolve(projectDir);
  const absoluteTarget = resolve(root, target);
  const relativeTarget = relative(root, absoluteTarget);

  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) return null;
  if (existsSync(root)) {
    try {
      assertNoSymlinkEscape(root, absoluteTarget, "Package target");
    } catch {
      return null;
    }
  }
  return absoluteTarget;
}
