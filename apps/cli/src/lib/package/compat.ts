import packageJson from "../../../package.json" with { type: "json" };
import { fail } from "../command.js";
import { readLockfile, type Lockfile } from "./lockfile.js";

export const PACKAGE_LOCK_FEATURES = {
  packageDependencies: "package-dependencies",
  generatedRequireAliases: "generated-require-aliases",
  gitPackageSources: "git-package-sources",
} as const;

export type PackageLockFeature = typeof PACKAGE_LOCK_FEATURES[keyof typeof PACKAGE_LOCK_FEATURES];

export const SUPPORTED_PACKAGE_LOCK_FEATURES = new Set<string>(Object.values(PACKAGE_LOCK_FEATURES));

export const PACKAGE_LOCK_FEATURE_REQUIREMENT = `>=${packageJson.version}`;

export type PackageLockCompatibility =
  | { ok: true }
  | {
      ok: false;
      message: string;
      unsupportedFeatures: string[];
      requiredFeather?: string;
    };

function parseVersion(value: string): [number, number, number] | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseMinimumRequirement(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const match = value.trim().match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! > b[index]!) return 1;
    if (a[index]! < b[index]!) return -1;
  }
  return 0;
}

function highestRequirement(requirements: Array<string | undefined>): string | undefined {
  let highest: { raw: string; parsed: [number, number, number] } | null = null;
  for (const requirement of requirements) {
    const parsed = parseMinimumRequirement(requirement);
    if (!requirement || !parsed) continue;
    if (!highest || compareVersions(parsed, highest.parsed) > 0) highest = { raw: requirement, parsed };
  }
  return highest?.raw;
}

function formatFeatureList(features: string[]): string {
  return features.length > 0 ? features.join(", ") : "newer package lock features";
}

export function checkPackageLockCompatibility(lockfile: Lockfile, currentVersion = packageJson.version): PackageLockCompatibility {
  const features = lockfile.features ?? [];
  const unsupportedFeatures = features.filter((feature) => !SUPPORTED_PACKAGE_LOCK_FEATURES.has(feature));
  const required = parseMinimumRequirement(lockfile.requiresFeather);
  const current = parseVersion(currentVersion);
  const tooNew = Boolean(required && current && compareVersions(current, required) < 0);

  if (!unsupportedFeatures.length && !tooNew) return { ok: true };

  const requiredFeather = highestRequirement([
    lockfile.requiresFeather,
    unsupportedFeatures.length > 0 ? undefined : PACKAGE_LOCK_FEATURE_REQUIREMENT,
  ]);
  const featureList = formatFeatureList(unsupportedFeatures.length > 0 ? unsupportedFeatures : features);
  const message = requiredFeather
    ? `This package lock uses features that require Feather ${requiredFeather}: ${featureList}. Update Feather before restoring packages.`
    : `This package lock uses unsupported features: ${featureList}. Update Feather before restoring packages.`;

  return { ok: false, message, unsupportedFeatures, requiredFeather };
}

export function assertPackageLockCompatible(lockfile: Lockfile): void {
  const compatibility = checkPackageLockCompatibility(lockfile);
  if (!compatibility.ok) fail(compatibility.message);
}

export function readCompatibleLockfile(projectDir: string): Lockfile {
  const lockfile = readLockfile(projectDir);
  assertPackageLockCompatible(lockfile);
  return lockfile;
}
