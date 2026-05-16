import {
  installCustomRepoPackage,
  installCustomUrlPackage,
  type CustomPackageInstallResult,
  type CustomRepoPackageInput,
  type CustomUrlFileInput,
  type CustomUrlPackageInput,
} from './custom-add.js';
import type { Lockfile } from './lockfile.js';

export type PackageAddRepoPlan = {
  kind: 'repo';
  id: string;
  requirePath: string;
  repoName: string;
  tag: string;
  baseUrl: string;
  selectedFiles: string[];
  targetMap: Record<string, string>;
};

export type PackageAddUrlPlan = {
  kind: 'url';
  id: string;
  requirePath: string;
  urlFiles: CustomUrlFileInput[];
};

export type PackageAddPlan = PackageAddRepoPlan | PackageAddUrlPlan;

export function packageAddPlanFiles(plan: PackageAddPlan): Array<{ name: string; target: string }> {
  if (plan.kind === 'repo') {
    return plan.selectedFiles.map((name) => ({ name, target: plan.targetMap[name] ?? name }));
  }
  return plan.urlFiles.map((file) => ({ name: file.name, target: file.target }));
}

export function toCustomRepoPackageInput(input: {
  plan: PackageAddRepoPlan;
  projectDir: string;
  lockfile: Lockfile;
  onFileStart?: (name: string) => void;
}): CustomRepoPackageInput {
  return {
    id: input.plan.id,
    repoName: input.plan.repoName,
    tag: input.plan.tag,
    baseUrl: input.plan.baseUrl,
    selectedFiles: input.plan.selectedFiles,
    targetMap: input.plan.targetMap,
    projectDir: input.projectDir,
    lockfile: input.lockfile,
    onFileStart: input.onFileStart,
  };
}

export function toCustomUrlPackageInput(input: {
  plan: PackageAddUrlPlan;
  projectDir: string;
  lockfile: Lockfile;
}): CustomUrlPackageInput {
  return {
    id: input.plan.id,
    urlFiles: input.plan.urlFiles,
    projectDir: input.projectDir,
    lockfile: input.lockfile,
  };
}

export async function installPackageAddPlan(input: {
  plan: PackageAddPlan;
  projectDir: string;
  lockfile: Lockfile;
  onFileStart?: (name: string) => void;
}): Promise<CustomPackageInstallResult> {
  if (input.plan.kind === 'repo') {
    return installCustomRepoPackage(
      toCustomRepoPackageInput({
        plan: input.plan,
        projectDir: input.projectDir,
        lockfile: input.lockfile,
        onFileStart: input.onFileStart,
      }),
    );
  }

  return installCustomUrlPackage(
    toCustomUrlPackageInput({
      plan: input.plan,
      projectDir: input.projectDir,
      lockfile: input.lockfile,
    }),
  );
}
