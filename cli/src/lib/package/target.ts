import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
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

export type PackageTargetPlanOptions = {
  targetOverride?: string;
  installDir?: string;
};

export function planPackageTarget(file: { name: string; target: string }, opts: PackageTargetPlanOptions = {}): string {
  if (opts.targetOverride) {
    return join(opts.targetOverride, basename(file.name));
  }

  if (opts.installDir) {
    const rest = dirname(file.target).split(/[\\/]/).filter(Boolean).slice(1);
    return join(opts.installDir, ...rest, basename(file.target));
  }

  return file.target;
}
