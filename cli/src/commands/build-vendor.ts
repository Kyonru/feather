import { fail } from '../lib/command.js';
import {
  createSpinner,
  printBlank,
  printJson,
  printKeyValues,
  printStatus,
  printTable,
  style,
} from '../lib/output.js';
import {
  addBuildVendors,
  buildVendorTargets,
  isBuildVendorTarget,
  listBuildVendors,
  type BuildVendorTargetInput,
} from '../lib/build/vendor.js';

export type BuildVendorCommandOptions = {
  dir?: string;
  config?: string;
  vendorDir?: string;
  ref?: string;
  webRef?: string;
  androidRef?: string;
  iosRef?: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
  configUpdate?: boolean;
};

export type BuildVendorListCommandOptions = {
  dir?: string;
  config?: string;
  vendorDir?: string;
  json?: boolean;
};

export async function buildVendorAddCommand(targetValues: string[], opts: BuildVendorCommandOptions = {}): Promise<void> {
  const invalid = targetValues.find((target) => !isBuildVendorTarget(target));
  if (invalid) {
    fail(`Unknown build vendor target: ${invalid}`, { details: [`Available: ${buildVendorTargets.join(', ')}`] });
  }
  const targets = targetValues as BuildVendorTargetInput[];
  const spinner = opts.json || opts.dryRun ? null : createSpinner('Fetching build vendors…').start();
  try {
    const result = await addBuildVendors(targets, {
      projectDir: opts.dir,
      configPath: opts.config,
      vendorDir: opts.vendorDir,
      ref: opts.ref,
      webRef: opts.webRef,
      androidRef: opts.androidRef,
      iosRef: opts.iosRef,
      force: opts.force,
      dryRun: opts.dryRun,
      updateConfig: opts.configUpdate,
    });

    if (opts.json) {
      printJson(result);
      return;
    }

    if (opts.dryRun) {
      printStatus('info', 'Build vendor plan');
    } else {
      spinner?.succeed('Build vendors ready');
    }
    printBlank();
    printKeyValues([
      ['Project', result.projectDir],
      ['Config', result.configPath],
      ['LÖVE', result.loveVersion],
    ]);
    printBlank();
    printTable({
      columns: [
        { key: 'target', label: 'Target' },
        { key: 'ref', label: 'Ref' },
        { key: 'path', label: 'Path' },
        { key: 'config', label: 'Config' },
      ],
      rows: result.vendors.map((vendor) => ({
        target: vendor.target,
        ref: vendor.ref,
        path: vendor.relativePath,
        config: vendor.configUpdated ? 'updated' : opts.dryRun && opts.configUpdate !== false ? 'planned' : 'unchanged',
      })),
    });
  } catch (err) {
    spinner?.fail((err as Error).message);
    fail((err as Error).message, { silent: Boolean(spinner) });
  }
}

export function buildVendorListCommand(opts: BuildVendorListCommandOptions = {}): void {
  const result = listBuildVendors({
    projectDir: opts.dir,
    configPath: opts.config,
    vendorDir: opts.vendorDir,
  });

  if (opts.json) {
    printJson(result);
    return;
  }

  printStatus('info', `Build vendors for ${style.heading(result.projectDir)}`);
  printBlank();
  printTable({
    columns: [
      { key: 'target', label: 'Target' },
      { key: 'configured', label: 'Configured' },
      { key: 'status', label: 'Status' },
      { key: 'path', label: 'Path' },
    ],
    rows: result.vendors.map((vendor) => ({
      target: vendor.target,
      configured: vendor.configured ? 'yes' : 'no',
      status: vendor.valid ? 'ready' : vendor.exists ? 'incomplete' : 'missing',
      path: vendor.configuredPath ?? vendor.relativePath,
    })),
  });
}
