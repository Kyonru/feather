import { basename, dirname, extname, posix } from "node:path";
import type { PackageFile, PackageLicenseFile } from "./registry.js";
import { planPackageTarget } from "./target.js";

export type PlannedPackageLicense = PackageFile & {
  role: "license";
};

function withoutExtension(path: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

function commonDirectory(targets: string[]): string | null {
  const directories = targets.map((target) => dirname(target)).filter((dir) => dir && dir !== ".");
  if (directories.length === 0) return null;
  const parts = directories[0]!.split("/");
  let end = parts.length;
  for (const dir of directories.slice(1)) {
    const next = dir.split("/");
    end = Math.min(end, next.length);
    for (let i = 0; i < end; i += 1) {
      if (parts[i] !== next[i]) {
        end = i;
        break;
      }
    }
  }
  return end > 0 ? parts.slice(0, end).join("/") : null;
}

function packageDirectory(id: string, targets: string[]): string | null {
  const segment = id.split(".")[0]!;
  for (const target of targets) {
    const parts = target.split("/");
    const index = parts.indexOf(segment);
    if (index >= 0) return parts.slice(0, index + 1).join("/");
  }
  return null;
}

function deriveLicenseTarget(id: string, license: PackageLicenseFile, plannedFileTargets: string[]): string {
  const licenseName = basename(license.name);
  if (plannedFileTargets.length === 1) {
    const onlyTarget = plannedFileTargets[0]!;
    if (basename(onlyTarget) === "init.lua") return posix.join(dirname(onlyTarget), licenseName);
    return posix.join(dirname(onlyTarget), `${basename(withoutExtension(onlyTarget))}.${licenseName}`);
  }

  const folder = packageDirectory(id, plannedFileTargets) ?? commonDirectory(plannedFileTargets);
  return folder ? posix.join(folder, licenseName) : `${id}.${licenseName}`;
}

export function planPackageLicenses(
  id: string,
  files: PackageFile[],
  licenses: PackageLicenseFile[] | undefined,
  opts: {
    targetOverride?: string;
    installDir?: string;
    layout?: "relocatable" | "fixed";
  },
): PlannedPackageLicense[] {
  if (!licenses?.length) return [];
  const plannedFileTargets = files.map((file) => planPackageTarget(file, opts));
  return licenses.map((license) => ({
    name: license.name,
    sha256: license.sha256,
    target: license.target
      ? planPackageTarget({ name: license.name, target: license.target }, opts)
      : deriveLicenseTarget(id, license, plannedFileTargets),
    role: "license",
  }));
}
