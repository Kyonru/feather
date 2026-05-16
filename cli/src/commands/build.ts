import { fail } from '../lib/command.js';
import {
  printBlank,
  printJson,
  printKeyValues,
  printMuted,
  printStatus,
  printTable,
  createSpinner,
  style,
} from '../lib/output.js';
import {
  buildTargets,
  isBuildTarget,
  type BuildTarget,
} from '../lib/build/config.js';
import { describeArtifact, runBuild } from '../lib/build/build.js';

export type BuildCommandOptions = {
  dir?: string;
  config?: string;
  outDir?: string;
  name?: string;
  version?: string;
  clean?: boolean;
  dryRun?: boolean;
  json?: boolean;
  allowUnsafe?: boolean;
  release?: boolean;
};

export async function buildCommand(targetValue: string, opts: BuildCommandOptions = {}): Promise<void> {
  if (!isBuildTarget(targetValue)) {
    fail(`Unknown build target: ${targetValue}`, { details: [`Available: ${buildTargets.join(', ')}`] });
  }
  const target: BuildTarget = targetValue;
  const spinner = opts.json || opts.dryRun ? null : createSpinner(`Building ${target}…`).start();
  const result = runBuild({
    target,
    projectDir: opts.dir,
    configPath: opts.config,
    outDir: opts.outDir,
    name: opts.name,
    version: opts.version,
    clean: opts.clean,
    dryRun: opts.dryRun,
    allowUnsafe: opts.allowUnsafe,
    release: opts.release,
  });

  if (!result.ok) {
    spinner?.fail(result.error);
    fail(result.error, { silent: Boolean(spinner) });
  }

  if (opts.json) {
    printJson(result);
    return;
  }

  if (result.dryRun) {
    printStatus('info', `Build plan for ${style.heading(result.target)}`);
  } else {
    spinner?.succeed(`Built ${result.target}`);
  }

  printBlank();
  printKeyValues([
    ['Project', result.projectDir],
    ['Output', result.outDir],
    ['Name', result.name],
    ['Version', result.version],
    ['Files', result.files.length],
  ]);
  printBlank();
  printTable({
    columns: [
      { key: 'type', label: 'Type' },
      { key: 'path', label: 'Path' },
    ],
    rows: result.artifacts.map((artifact) => ({
      type: artifact.type,
      path: result.dryRun ? artifact.path : describeArtifact(artifact),
    })),
  });
  if (result.manifestPath && !result.dryRun) {
    printBlank();
    printMuted(`Manifest: ${result.manifestPath}`);
  }
}
