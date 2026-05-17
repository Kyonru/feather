import { fail } from '../lib/command.js';
import {
  createSpinner,
  printBlank,
  printDanger,
  printJson,
  printKeyValues,
  printMuted,
  printStatus,
  printWarning,
  style,
} from '../lib/output.js';
import { buildTargets, isBuildTarget, isUploadTarget, uploadTargets, type BuildTarget, type UploadTarget } from '../lib/build/config.js';
import { runBuild } from '../lib/build/build.js';
import { runUpload } from '../lib/build/upload.js';
import { chooseUploadWorkflow, type UploadWorkflowResult } from '../ui/upload-workflow.js';
import type { UploadSafetyResult } from '../lib/build/upload-safety.js';

export type UploadCommandOptions = {
  dir?: string;
  config?: string;
  buildDir?: string;
  project?: string;
  channel?: string;
  userVersion?: string;
  dryRun?: boolean;
  ifChanged?: boolean;
  hidden?: boolean;
  json?: boolean;
  yes?: boolean;
  build?: boolean;
  outDir?: string;
  release?: boolean;
  allowUnsafe?: boolean;
  clean?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  allowFeatherRuntime?: boolean;
};

type ResolvedUploadInput = {
  targetValue: string;
  buildTarget?: string;
  opts: UploadCommandOptions;
  confirmedUnsafe?: boolean;
};

function isInteractive(opts: UploadCommandOptions): boolean {
  return Boolean(!opts.json && process.stdin.isTTY && process.stdout.isTTY);
}

function printSafetyWarning(safety: UploadSafetyResult, warning: string): void {
  printBlank();
  printDanger('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  printDanger('!  UPLOAD SAFETY WARNING                                  !');
  printDanger('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  printWarning(warning);
  printKeyValues([
    ['Status', safety.status],
    ['Artifact', safety.artifact],
    ['Detected', safety.detectedFiles.length ? safety.detectedFiles.join(', ') : safety.reason ?? 'unknown'],
  ]);
  printDanger('Review this upload before sharing it with players.');
}

async function resolveUploadInput(
  targetValue: string | undefined,
  buildTarget: string | undefined,
  opts: UploadCommandOptions,
): Promise<ResolvedUploadInput> {
  if (!targetValue && isInteractive(opts)) {
    const result = await chooseUploadWorkflow({
      dir: opts.dir,
      config: opts.config,
      buildDir: opts.buildDir,
      project: opts.project,
      channel: opts.channel,
      userVersion: opts.userVersion,
    });
    if (result.cancelled) fail('Upload cancelled.');
    return {
      targetValue: result.target,
      buildTarget: result.buildTarget,
      confirmedUnsafe: result.allowFeatherRuntime,
      opts: {
        ...opts,
        dir: result.dir,
        config: result.config,
        buildDir: result.buildDir,
        project: result.project,
        channel: result.channel,
        userVersion: result.userVersion,
        dryRun: result.dryRun,
        build: result.build,
        allowFeatherRuntime: result.allowFeatherRuntime,
        yes: result.confirmed,
      },
    };
  }

  if (!targetValue) {
    fail('Upload target is required in non-interactive mode. Example: feather upload itch web --dir path/to/game --yes');
  }

  return { targetValue, buildTarget, opts };
}

export async function uploadCommand(targetValue: string | undefined, buildTarget: string | undefined, opts: UploadCommandOptions = {}): Promise<void> {
  const resolved = await resolveUploadInput(targetValue, buildTarget, opts);
  targetValue = resolved.targetValue;
  buildTarget = resolved.buildTarget;
  opts = resolved.opts;

  if (!isUploadTarget(targetValue)) {
    fail(`Unknown upload target: ${targetValue}`, { details: [`Available: ${uploadTargets.join(', ')}`] });
  }
  const target: UploadTarget = targetValue;
  if (buildTarget && !isBuildTarget(buildTarget)) {
    fail(`Unknown build target: ${buildTarget}`, { details: [`Available: ${buildTargets.join(', ')}`] });
  }
  if (!opts.dryRun && !opts.yes && !isInteractive(opts)) {
    fail('Refusing to upload without --yes in non-interactive mode.');
  }
  if (opts.build) {
    if (!buildTarget || !isBuildTarget(buildTarget)) {
      fail('A build target is required with --build. Example: feather upload itch web --build');
    }
    const verbose = Boolean(opts.verbose && !opts.json && !opts.dryRun);
    const buildSpinner = opts.json || opts.dryRun || verbose ? null : createSpinner(`Building ${buildTarget}…`).start();
    const buildResult = runBuild({
      target: buildTarget as BuildTarget,
      projectDir: opts.dir,
      configPath: opts.config,
      outDir: opts.outDir,
      clean: opts.clean,
      dryRun: false,
      allowUnsafe: opts.allowUnsafe,
      release: opts.release,
      noCache: opts.noCache,
      verbose,
      log: verbose ? printMuted : undefined,
    });
    if (!buildResult.ok) {
      buildSpinner?.fail(buildResult.error);
      fail(buildResult.error, { silent: Boolean(buildSpinner) });
    }
    buildSpinner?.succeed(`Built ${buildTarget}`);
  }
  const spinner = opts.json || opts.dryRun ? null : createSpinner(`Uploading to ${target}…`).start();
  const result = runUpload({
    target,
    buildTarget,
    projectDir: opts.dir,
    configPath: opts.config,
    buildDir: opts.buildDir,
    project: opts.project,
    channel: opts.channel,
    userVersion: opts.userVersion,
    dryRun: opts.dryRun,
    ifChanged: opts.ifChanged,
    hidden: opts.hidden,
    allowFeatherRuntime: opts.allowFeatherRuntime || resolved.confirmedUnsafe,
  });

  if (!result.ok) {
    spinner?.fail(result.error);
    if (opts.json) {
      printJson(result);
      process.exitCode = 1;
      return;
    }
    if (result.safety) {
      printBlank();
      printKeyValues([
        ['Safety', result.safety.status],
        ['Artifact', result.safety.artifact],
        ['Reason', result.safety.reason],
        ['Detected', result.safety.detectedFiles.join(', ')],
      ]);
    }
    fail(result.error, { silent: Boolean(spinner) });
  }

  if (opts.json) {
    printJson(result);
    return;
  }

  if (result.dryRun) {
    printStatus('info', `Upload plan for ${style.heading(result.target)}`);
  } else {
    spinner?.succeed(`Uploaded ${result.buildTarget} to ${result.project}:${result.channel}`);
  }
  printBlank();
  printKeyValues([
    ['Target', result.target],
    ['Build', result.buildTarget],
    ['Artifact', result.artifact],
    ['Project', result.project],
    ['Channel', result.channel],
    ['Version', result.userVersion],
  ]);
  if (result.dryRun) {
    printBlank();
    printMuted(`Command: ${result.command.join(' ')}`);
  }
  if (!result.dryRun && result.warning) {
    printSafetyWarning(result.safety, result.warning);
  }
}
