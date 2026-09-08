import { fail } from '../lib/command.js';
import {
  createSpinner,
  printBlank,
  printJson,
  printKeyValues,
  printMuted,
  printStatus,
  printTable,
  printWarning,
  style,
} from '../lib/output.js';
import {
  addBuildVendors,
  buildVendorTargets,
  isBuildVendorTarget,
  listBuildVendors,
  type BuildVendorTargetInput,
  type ConcreteBuildVendorTarget,
} from '../lib/build/vendor.js';
import { confirmAction } from '../ui/confirm.js';

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

    const installed = result.vendors.filter((v) => v.installed || v.skipped);
    const skipped = result.skippedTargets;

    if (installed.length > 0 || opts.dryRun) {
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
        rows: installed.map((vendor) => ({
          target: vendor.target,
          ref: vendor.ref,
          path: vendor.relativePath,
          config: vendor.configUpdated ? 'updated' : opts.dryRun && opts.configUpdate !== false ? 'planned' : 'unchanged',
        })),
      });
      if (result.vendors.some((vendor) => vendor.target === 'steamos' && (vendor.installed || vendor.skipped))) {
        printBlank();
        printMuted('SteamOS Devkit setup is manual before using `feather watch --target steamos`:');
        printMuted('Official Steam Deck loading docs: https://partner.steamgames.com/doc/steamdeck/loadgames');
        printMuted('Cross-platform Devkit client, especially useful on macOS: https://gitlab.steamos.cloud/devkit/steamos-devkit');
      }
    } else {
      spinner?.stop();
    }

    if (skipped.length > 0 && !opts.dryRun) {
      await handleSkippedVendors(skipped, opts, targets);
    }
  } catch (err) {
    spinner?.fail((err as Error).message);
    fail((err as Error).message, { silent: Boolean(spinner) });
  }
}

async function handleSkippedVendors(
  skipped: ConcreteBuildVendorTarget[],
  opts: BuildVendorCommandOptions,
  originalTargets: BuildVendorTargetInput[],
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printWarning(`${skipped.length} vendor(s) already exist: ${skipped.join(', ')}. Use --force to overwrite.`);
    return;
  }

  const shouldOverride = await confirmAction({
    title: 'feather build vendor add',
    label: `${skipped.length} vendor(s) already exist. Overwrite?`,
    hint: 'Pass --force to skip this prompt.',
    rows: skipped,
    defaultYes: false,
  });

  if (!shouldOverride) {
    printMuted(`Skipped: ${skipped.join(', ')}`);
    return;
  }

  const overwriteSpinner = createSpinner(`Overwriting ${skipped.join(', ')}…`).start();
  try {
    await addBuildVendors(skipped as BuildVendorTargetInput[], {
      projectDir: opts.dir,
      configPath: opts.config,
      vendorDir: opts.vendorDir,
      ref: opts.ref,
      webRef: opts.webRef,
      androidRef: opts.androidRef,
      iosRef: opts.iosRef,
      force: true,
      updateConfig: opts.configUpdate,
    });
    overwriteSpinner.succeed(`Overwritten: ${skipped.join(', ')}`);
  } catch (err) {
    overwriteSpinner.fail((err as Error).message);
    fail((err as Error).message, { silent: true });
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
