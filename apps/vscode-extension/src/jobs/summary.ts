import type { JobResult } from './runner';

// Turn the CLI's `--json` results into one line for a notification. Pure, so
// it is tested against the shapes the CLI prints. Unknown shapes yield nothing
// and the notification falls back to the job title.

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (isObject(item) ? String(item.id ?? item.name ?? '') : String(item))).filter(Boolean);
}

export function summarizeJson(json: unknown): string | undefined {
  if (!isObject(json)) return undefined;

  // feather doctor --json
  if (Array.isArray(json.checks) && typeof json.failures === 'number') {
    const warnings = typeof json.warnings === 'number' ? json.warnings : 0;
    if (json.failures === 0 && warnings === 0) return 'Doctor found no problems.';
    return `Doctor found ${json.failures} blocker${json.failures === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'}.`;
  }
  // feather init --json
  if (typeof json.mode === 'string' && 'configCreated' in json) {
    const plugins = ids(json.plugins);
    return `Initialized in ${json.mode} mode${plugins.length > 0 ? ` with ${plugins.join(', ')}` : ' without plugins'}.`;
  }
  // feather build <target> --json
  if (Array.isArray(json.artifacts)) {
    const count = json.artifacts.length;
    const where = typeof json.outDir === 'string' ? ` in ${json.outDir}` : '';
    return json.dryRun === true ? `Build plan: ${count} artifact${count === 1 ? '' : 's'}${where}.` : `Built ${count} artifact${count === 1 ? '' : 's'}${where}.`;
  }
  // feather plugin update --json in a CLI-managed project
  if (Array.isArray(json.skipped) && json.skipped.some(isObject)) {
    const detail = json.skipped.filter(isObject).map((item) => String(item.detail ?? item.reason ?? '')).find(Boolean);
    if (detail) return detail;
  }
  // feather config plugins --json (also what plugin install/remove print in CLI-managed projects)
  if (isObject(json.requested) && Array.isArray(json.include)) {
    const included = ids(json.include);
    return `Included plugins: ${included.length > 0 ? included.join(', ') : 'none'}.`;
  }
  if (Array.isArray(json.installed)) {
    const installed = ids(json.installed);
    const skipped = ids(json.skipped);
    if (installed.length === 0 && skipped.length > 0) return `Already installed: ${skipped.join(', ')}.`;
    return `Installed ${installed.join(', ') || 'nothing'}.`;
  }
  if (isObject(json.removed) || Array.isArray(json.removed)) {
    const removed = isObject(json.removed) ? ids([json.removed]) : ids(json.removed);
    return `Removed ${removed.join(', ')}.`;
  }
  return undefined;
}

const SEVERITY_MARK: Record<string, string> = { fail: '✖', warn: '!', pass: '✔', info: 'i' };

/**
 * What a `--json` step leaves in the output channel. Doctor's report is
 * rendered the way the CLI renders it in a terminal; other results are shown
 * as the JSON the CLI printed.
 */
export function renderJsonForOutput(json: unknown): string {
  if (isObject(json) && Array.isArray(json.checks)) {
    const lines: string[] = [];
    if (typeof json.projectDir === 'string') lines.push(`Project: ${json.projectDir}`, '');
    const checks = json.checks.filter(isObject);
    for (const group of [...new Set(checks.map((check) => String(check.group)))]) {
      lines.push(group);
      for (const check of checks.filter((item) => String(item.group) === group)) {
        const mark = SEVERITY_MARK[String(check.severity)] ?? '-';
        lines.push(`  ${mark} ${String(check.label)}${check.detail ? `  ${String(check.detail)}` : ''}`);
        if (check.fix) lines.push(`      → ${String(check.fix)}`);
      }
      lines.push('');
    }
    const summary = summarizeJson(json);
    if (summary) lines.push(summary);
    return lines.join('\n');
  }
  return JSON.stringify(json, null, 2);
}

export function summarize(result: JobResult): string {
  // Doctor exits 1 when it finds blockers; its report says more than the exit code.
  const reported = result.status === 'failed' ? summarizeJson(result.json) : undefined;
  if (reported) return `${result.title}: ${reported}`;
  if (result.status === 'failed') return `${result.title} failed: ${result.message}`;
  if (result.status === 'cancelled') return `${result.title} was cancelled.`;
  const detail = summarizeJson(result.json);
  return detail ? `${result.title}: ${detail}` : `${result.title} finished.`;
}
