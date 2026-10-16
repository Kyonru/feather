import type { JobSpec, JobStep } from './jobs/runner';

// Every Feather CLI argv the extension constructs is built here, from plain
// choices, with no `vscode` import. That keeps the user-interaction code in
// `workflows/` free of option names, and lets `test/cli-contract.test.mjs`
// parse each plan against the compiled CLI's command tree: an option the CLI
// renamed or never had fails a test instead of failing in someone's editor.
//
// What does *not* belong here is CLI policy. Managed-mode detection, plugin
// defaults, vendor paths and production safety are the CLI's; a plan passes the
// user's choices and lets the CLI decide.

export type Plan = Omit<JobSpec, 'cwd'>;

export type RunTarget = 'desktop' | 'web' | 'android' | 'ios' | 'steamos';
export const RUN_TARGETS: readonly RunTarget[] = ['desktop', 'web', 'android', 'ios', 'steamos'];

export type InitMode = 'cli' | 'auto' | 'manual';

export type InitChoices = {
  mode: InitMode;
  sessionName?: string;
  security?: { kind: 'appId'; appId: string } | { kind: 'insecure' } | { kind: 'unset' };
  source?: { kind: 'bundled' } | { kind: 'remote'; branch: string } | { kind: 'local'; path: string };
  /**
   * `ids` with an empty list is the same as `none`. `cli-default` passes no
   * plugin flag and lets the CLI apply its own default.
   */
  plugins: { kind: 'ids'; ids: string[] } | { kind: 'none' } | { kind: 'cli-default' };
  hotReloadAllow?: string[];
};

const json = (args: string[]): JobStep => ({ args: [...args, '--json'], json: true });
const human = (args: string[]): JobStep => ({ args });

export function initPlan(root: string, choices: InitChoices): Plan {
  const args = ['init', root, '--mode', choices.mode, '--yes'];
  if (choices.sessionName) args.push('--session-name', choices.sessionName);
  if (choices.security?.kind === 'appId') args.push('--app-id', choices.security.appId);
  if (choices.security?.kind === 'insecure') args.push('--allow-insecure-connection');
  if (choices.source?.kind === 'remote') args.push('--remote', '--branch', choices.source.branch);
  if (choices.source?.kind === 'local') args.push('--local-src', choices.source.path);
  if (choices.plugins.kind === 'none' || (choices.plugins.kind === 'ids' && choices.plugins.ids.length === 0)) {
    args.push('--no-plugins');
  } else if (choices.plugins.kind === 'ids') {
    args.push('--plugins', choices.plugins.ids.join(','));
  }
  if (choices.hotReloadAllow && choices.hotReloadAllow.length > 0) {
    args.push('--hot-reload-allow', choices.hotReloadAllow.join(','));
  }
  return { title: `Initialize Feather (${choices.mode} mode)`, steps: [json(args)] };
}

export type PluginAction = 'install' | 'update' | 'remove';

/**
 * `managed` is the mode the CLI reported (`plugin list --json`). In CLI-managed
 * projects `plugin install/remove` already edit the config include list; in
 * embedded projects they only copy or delete files, so the config step follows.
 * When the mode is unknown the config step runs anyway — it is idempotent.
 */
export function pluginsPlan(
  root: string,
  action: PluginAction,
  ids: string[],
  managed: string | null | undefined,
  hotReloadAllow: string[] = [],
): Plan {
  const steps: JobStep[] = [];
  const editsConfigItself = managed === 'cli';
  if (action === 'install') {
    steps.push(json(['plugin', 'install', ...ids, '--dir', root]));
    if (!editsConfigItself) steps.push(json(['config', 'plugins', '--dir', root, '--include', ids.join(',')]));
    if (hotReloadAllow.length > 0) steps.push(human(['config', 'hot-reload', '--dir', root, '--allow', hotReloadAllow.join(',')]));
  } else if (action === 'remove') {
    for (const id of ids) steps.push(json(['plugin', 'remove', id, '--dir', root, '--yes']));
    if (!editsConfigItself) steps.push(json(['config', 'plugins', '--dir', root, '--exclude', ids.join(',')]));
  } else {
    for (const id of ids) steps.push(json(['plugin', 'update', id, '--dir', root, '--yes']));
  }
  return { title: `${capitalize(action)} plugin${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`, steps };
}

export type PackageAction = 'install' | 'update' | 'remove';

export function packagesPlan(root: string, action: PackageAction, ids: string[]): Plan {
  const steps: JobStep[] =
    action === 'install'
      ? [json(['package', 'install', ...ids, '--dir', root, '--yes'])]
      : action === 'update'
        ? ids.map((id) => json(['package', 'update', id, '--dir', root]))
        : ids.map((id) => json(['package', 'remove', id, '--dir', root, '--yes']));
  return { title: `${capitalize(action)} package${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`, steps };
}

export type VendorTarget = 'all' | 'web' | 'android' | 'ios' | 'desktop' | 'mobile';

/** `vendorDir` is project-relative; undefined lets the CLI use its default. */
export function vendorAddPlan(root: string, targets: VendorTarget[], vendorDir?: string): Plan {
  const args = ['build', 'vendor', 'add', ...targets, '--dir', root];
  if (vendorDir) args.push('--vendor-dir', vendorDir);
  return { title: `Fetch build vendors (${targets.join(', ')})`, steps: [human(args)] };
}

export function vendorListPlan(root: string, vendorDir?: string): Plan {
  const args = ['build', 'vendor', 'list', '--dir', root];
  if (vendorDir) args.push('--vendor-dir', vendorDir);
  return { title: 'List build vendors', steps: [human(args)] };
}

/** Read-only query used to decide whether a run target is missing its vendor. */
export function vendorStatusArgs(root: string, vendorDir?: string): string[] {
  const args = ['build', 'vendor', 'list', '--dir', root, '--json'];
  if (vendorDir) args.push('--vendor-dir', vendorDir);
  return args;
}

export type ReleaseTarget = 'android' | 'ios';
export type ReleaseOption = 'clean' | 'dry-run' | 'no-cache' | 'verbose';

export function releaseBuildPlan(root: string, target: ReleaseTarget, options: Iterable<ReleaseOption>): Plan {
  const selected = new Set(options);
  const args = ['build', target, '--dir', root, '--release', '--no-debugger'];
  if (selected.has('clean')) args.push('--clean');
  if (selected.has('dry-run')) args.push('--dry-run');
  if (selected.has('no-cache')) args.push('--no-cache');
  const title = `${target === 'ios' ? 'iOS' : 'Android'} release build`;
  // Verbose streams native tool output; the CLI suppresses it under --json.
  // Without verbose the CLI prints nothing until it finishes, so --json loses
  // nothing and reports the artifacts it wrote.
  if (selected.has('verbose')) return { title, steps: [human([...args, '--verbose'])] };
  return { title, steps: [json(args)] };
}

export type UploadChoices = {
  target: string;
  channel?: string;
  buildTarget?: string;
  dryRun: boolean;
};

export function uploadPlan(root: string, choices: UploadChoices): Plan {
  const args = ['upload', choices.target];
  if (choices.buildTarget) args.push(choices.buildTarget, '--build');
  args.push('--dir', root, '--yes');
  if (choices.dryRun) args.push('--dry-run');
  if (choices.channel) args.push('--channel', choices.channel);
  return { title: choices.dryRun ? `Upload dry run (${choices.target})` : `Upload to ${choices.target}`, steps: [human(args)] };
}

export function doctorPlan(root: string): Plan {
  return { title: 'Feather doctor', steps: [json(['doctor', root])] };
}

export function removePlan(root: string): Plan {
  return { title: 'Remove Feather', steps: [human(['remove', root, '--yes'])] };
}

export function updatePlan(root: string): Plan {
  return { title: 'Update Feather runtime', steps: [human(['update', root, '--yes'])] };
}

/** The read-only queries the project view is built from. Each prints JSON. */
export function projectStateQueries(root: string): { doctor: string[]; plugins: string[]; packages: string[] } {
  return {
    doctor: ['doctor', root, '--json'],
    plugins: ['plugin', 'list', root, '--json'],
    packages: ['package', 'list', '--installed', '--offline', '--dir', root, '--json'],
  };
}

export type TerminalPlan = { name: string; target: RunTarget; args: string[] };

/**
 * `run` and `watch` are long-lived and interactive, so they stay in terminals.
 * Watch cannot serve the web target; it is reported back rather than dropped.
 */
export function runPlans(
  root: string,
  targets: RunTarget[],
  options: { watch: boolean; love?: string },
): { plans: TerminalPlan[]; skipped: RunTarget[] } {
  const plans: TerminalPlan[] = [];
  const skipped: RunTarget[] = [];
  for (const target of targets) {
    if (options.watch && target === 'web') {
      skipped.push(target);
      continue;
    }
    const verb = options.watch ? 'watch' : 'run';
    const args = [verb, '--target', target, root];
    if (options.love && target === 'desktop') args.push('--love', options.love);
    const suffix = targets.length > 1 ? ` (${target})` : '';
    plans.push({ name: `Feather: ${options.watch ? 'Watch' : 'Run'}${suffix}`, target, args });
  }
  return { plans, skipped };
}

/** Run targets that need a build vendor, mapped to the CLI's vendor target name. */
export function runTargetVendor(target: RunTarget): 'web' | 'android' | 'ios' | undefined {
  return target === 'web' || target === 'android' || target === 'ios' ? target : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
