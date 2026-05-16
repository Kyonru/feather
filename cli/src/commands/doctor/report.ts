import { icon as statusIcon, style } from '../../lib/output.js';
import { type DoctorCheck, type Severity, severityOrder } from './checks.js';

function icon(severity: Severity): string {
  if (severity === 'pass') return statusIcon.success;
  if (severity === 'warn') return statusIcon.warning;
  if (severity === 'fail') return statusIcon.error;
  return statusIcon.info;
}

function colorLabel(severity: Severity, label: string): string {
  if (severity === 'warn') return style.warning(label);
  if (severity === 'fail') return style.danger(label);
  return label;
}

export function renderReport(checks: DoctorCheck[], projectDir: string): void {
  console.log(style.heading('\nFeather doctor\n'));
  console.log(style.muted(`Project: ${projectDir}\n`));

  const groups = [...new Set(checks.map((check) => check.group))];
  for (const group of groups) {
    console.log(style.heading(group));
    for (const check of checks.filter((item) => item.group === group).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])) {
      console.log(`  ${icon(check.severity)} ${colorLabel(check.severity, check.label)}${check.detail ? style.muted(`  ${check.detail}`) : ''}`);
      if (check.fix) console.log(style.muted(`    → ${check.fix}`));
    }
    console.log();
  }

  const failures = checks.filter((check) => check.severity === 'fail');
  const warnings = checks.filter((check) => check.severity === 'warn');
  const passed = checks.filter((check) => check.severity === 'pass');

  if (failures.length > 0) {
    console.log(style.danger(`Doctor found ${failures.length} blocker${failures.length === 1 ? '' : 's'}.`));
  } else if (warnings.length > 0) {
    console.log(style.warning(`Doctor passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`));
  } else {
    console.log(style.success('Doctor found no problems.'));
  }
  console.log(style.muted(`${passed.length} passed, ${warnings.length} warnings, ${failures.length} failures.\n`));
}
