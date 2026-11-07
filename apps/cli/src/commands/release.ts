import { fail } from '../lib/command.js';
import {
  createSpinner,
  printBlank,
  printJson,
  printKeyValues,
  printMuted,
  printStatus,
  printTable,
  style,
} from '../lib/output.js';
import {
  initFastlaneRelease,
  isReleaseLane,
  isReleaseTarget,
  releaseLanes,
  releaseSafetyWarnings,
  releaseTargets,
  runFastlaneRelease,
  type ReleaseLane,
  type ReleaseTarget,
} from '../lib/build/release.js';

export type ReleaseCommandOptions = {
  dir?: string;
  config?: string;
  outDir?: string;
  name?: string;
  version?: string;
  dryRun?: boolean;
  json?: boolean;
  clean?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  skipBuild?: boolean;
};

export async function releaseInitCommand(opts: ReleaseCommandOptions = {}): Promise<void> {
  const result = initFastlaneRelease({
    projectDir: opts.dir,
    configPath: opts.config,
    dryRun: opts.dryRun,
    json: opts.json,
  });
  if (!result.ok) {
    if (opts.json) {
      printJson(result);
      process.exitCode = 1;
      return;
    }
    fail(result.error);
  }
  if (opts.json) {
    printJson(result);
    return;
  }

  printStatus(result.dryRun ? 'info' : 'success', result.dryRun ? 'Fastlane scaffold plan' : 'Fastlane scaffold ready');
  printBlank();
  printKeyValues([
    ['Project', result.projectDir],
    ['Fastlane', result.fastlaneDir],
  ]);
  printBlank();
  printTable({
    columns: [
      { key: 'action', label: 'Action' },
      { key: 'path', label: 'Path' },
    ],
    rows: result.files.map((file) => ({ action: file.action, path: file.path })),
  });
}

export async function releaseRunCommand(
  targetValue: string,
  laneValue: string | undefined,
  opts: ReleaseCommandOptions = {},
): Promise<void> {
  if (!isReleaseTarget(targetValue)) {
    fail(`Unknown release target: ${targetValue}`, { details: [`Available: ${releaseTargets.join(', ')}`] });
  }
  const lane = laneValue ?? 'beta';
  if (!isReleaseLane(lane)) {
    fail(`Unknown release lane: ${lane}`, { details: [`Available: ${releaseLanes.join(', ')}`] });
  }

  const target: ReleaseTarget = targetValue;
  const releaseLane: ReleaseLane = lane;
  const verbose = Boolean(opts.verbose && !opts.json && !opts.dryRun);
  const spinner = opts.json || opts.dryRun || verbose ? null : createSpinner(`Running ${target} ${releaseLane} release…`).start();
  const result = runFastlaneRelease({
    target,
    lane: releaseLane,
    projectDir: opts.dir,
    configPath: opts.config,
    outDir: opts.outDir,
    name: opts.name,
    version: opts.version,
    dryRun: opts.dryRun,
    clean: opts.clean,
    noCache: opts.noCache,
    verbose,
    skipBuild: opts.skipBuild,
  });

  if (!result.ok) {
    spinner?.fail(result.error);
    if (opts.json) {
      printJson(result);
      process.exitCode = 1;
      return;
    }
    fail(result.error, { silent: Boolean(spinner) });
  }

  if (opts.json) {
    printJson(result);
    return;
  }

  if (result.dryRun) {
    printStatus('info', `Release plan for ${style.heading(`${result.target} ${result.lane}`)}`);
  } else {
    spinner?.succeed(`Released ${result.target} ${result.lane}`);
  }

  printBlank();
  printKeyValues([
    ['Project', result.projectDir],
    ['Fastlane', result.fastlaneDir],
    ['Target', result.target],
    ['Lane', result.lane],
  ]);
  if (result.artifacts.length > 0) {
    printBlank();
    printTable({
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'path', label: 'Path' },
      ],
      rows: result.artifacts.map((artifact) => ({ type: artifact.type, path: artifact.path })),
    });
  }
  printBlank();
  printMuted(`Command: ${result.command.join(' ')}`);
  const warnings = releaseSafetyWarnings(result.safety);
  if (warnings.length > 0) {
    printBlank();
    for (const warning of warnings) printMuted(`Safety: ${warning}`);
  }
}
