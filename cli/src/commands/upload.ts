import { fail } from '../lib/command.js';
import {
  createSpinner,
  printBlank,
  printJson,
  printKeyValues,
  printMuted,
  printStatus,
  style,
} from '../lib/output.js';
import { isUploadTarget, uploadTargets, type UploadTarget } from '../lib/build/config.js';
import { runUpload } from '../lib/build/upload.js';

export type UploadCommandOptions = {
  dir?: string;
  config?: string;
  buildDir?: string;
  channel?: string;
  userVersion?: string;
  dryRun?: boolean;
  ifChanged?: boolean;
  hidden?: boolean;
  json?: boolean;
};

export async function uploadCommand(targetValue: string, buildTarget: string | undefined, opts: UploadCommandOptions = {}): Promise<void> {
  if (!isUploadTarget(targetValue)) {
    fail(`Unknown upload target: ${targetValue}`, { details: [`Available: ${uploadTargets.join(', ')}`] });
  }
  const target: UploadTarget = targetValue;
  const spinner = opts.json || opts.dryRun ? null : createSpinner(`Uploading to ${target}…`).start();
  const result = runUpload({
    target,
    buildTarget,
    projectDir: opts.dir,
    configPath: opts.config,
    buildDir: opts.buildDir,
    channel: opts.channel,
    userVersion: opts.userVersion,
    dryRun: opts.dryRun,
    ifChanged: opts.ifChanged,
    hidden: opts.hidden,
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
}
