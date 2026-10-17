import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { projectStateQueries } from '../plans';
import type { StepResult } from '../jobs/runner';

// Project state comes from the CLI. The extension used to parse feather.config.lua
// with regular expressions and feather.lock.json with a try/catch that turned a
// broken lockfile into "0 packages installed". Now the view shows what
// `feather doctor --json`, `feather plugin list --json` and `feather package list
// --json` report, so it cannot disagree with Doctor.

export type Severity = 'pass' | 'warn' | 'fail' | 'info';

export type DoctorCheck = {
  group: string;
  label: string;
  severity: Severity;
  detail?: string;
  fix?: string;
};

export type DoctorReport = { failures: number; warnings: number; checks: DoctorCheck[] };
export type PluginReport = { managed: string | null; ids: string[] };
export type PackageReport = { ids: string[] };

/** A CLI answer, or the CLI's own error message when it could not give one. */
export type CliRead<T> = { ok: true; value: T } | { ok: false; error: string };

export type ProjectState = {
  root: string;
  name: string;
  hasMain: boolean;
  hasConfig: boolean;
  doctor: CliRead<DoctorReport>;
  plugins: CliRead<PluginReport>;
  packages: CliRead<PackageReport>;
};

export type CliExec = (args: string[]) => Promise<StepResult>;

function cliError(result: StepResult, what: string): string {
  if (result.spawnError) return result.spawnError;
  const line = result.stderr
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  if (line) return line.replace(/^[✖✗×]\s*/u, '');
  return `${what} failed with exit code ${result.exitCode ?? 'unknown'}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Doctor exits 1 when it finds blockers but still prints its report; that is a valid answer. */
export function parseDoctor(result: StepResult): CliRead<DoctorReport> {
  const value = result.json;
  if (isObject(value) && Array.isArray(value.checks)) {
    const checks = value.checks.filter(isObject).map((check) => ({
      group: String(check.group ?? ''),
      label: String(check.label ?? ''),
      severity: (['pass', 'warn', 'fail', 'info'].includes(String(check.severity)) ? check.severity : 'info') as Severity,
      ...(typeof check.detail === 'string' ? { detail: check.detail } : {}),
      ...(typeof check.fix === 'string' ? { fix: check.fix } : {}),
    }));
    return {
      ok: true,
      value: {
        failures: typeof value.failures === 'number' ? value.failures : checks.filter((c) => c.severity === 'fail').length,
        warnings: typeof value.warnings === 'number' ? value.warnings : checks.filter((c) => c.severity === 'warn').length,
        checks,
      },
    };
  }
  return { ok: false, error: cliError(result, 'feather doctor') };
}

export function parsePluginList(result: StepResult): CliRead<PluginReport> {
  const value = result.json;
  if (result.exitCode === 0 && isObject(value) && Array.isArray(value.plugins)) {
    return {
      ok: true,
      value: {
        managed: typeof value.managed === 'string' ? value.managed : null,
        ids: value.plugins.filter(isObject).map((plugin) => String(plugin.id)),
      },
    };
  }
  return { ok: false, error: cliError(result, 'feather plugin list') };
}

export function parsePackageList(result: StepResult): CliRead<PackageReport> {
  const value = result.json;
  if (result.exitCode === 0 && isObject(value) && Array.isArray(value.packages)) {
    return {
      ok: true,
      value: { ids: value.packages.filter(isObject).map((pkg) => String(pkg.id ?? pkg.name)) },
    };
  }
  return { ok: false, error: cliError(result, 'feather package list') };
}

export async function loadProjectState(root: string, exec: CliExec): Promise<ProjectState> {
  const queries = projectStateQueries(root);
  const [doctor, plugins, packages] = await Promise.all([
    exec(queries.doctor),
    exec(queries.plugins),
    exec(queries.packages),
  ]);
  return {
    root,
    name: basename(root),
    hasMain: existsSync(join(root, 'main.lua')),
    hasConfig: existsSync(join(root, 'feather.config.lua')) || existsSync(join(root, '.featherrc.lua')),
    doctor: parseDoctor(doctor),
    plugins: parsePluginList(plugins),
    packages: parsePackageList(packages),
  };
}

/** Doctor's blockers and warnings, in its own order. */
export function doctorProblems(state: Pick<ProjectState, 'doctor'>): DoctorCheck[] {
  if (!state.doctor.ok) return [];
  return state.doctor.value.checks.filter((check) => check.severity === 'fail' || check.severity === 'warn');
}

/** The doctor check that speaks for a project file, so a broken file is shown with Doctor's words. */
export function doctorCheckFor(state: Pick<ProjectState, 'doctor'>, label: string): DoctorCheck | undefined {
  if (!state.doctor.ok) return undefined;
  return state.doctor.value.checks.find((check) => check.label === label);
}
