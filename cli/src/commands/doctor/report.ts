import chalk from 'chalk';
import { icon as statusIcon, style } from '../../lib/output.js';
import { type DoctorCheck, type Severity, severityOrder } from './checks.js';

function icon(severity: Severity): string {
  if (severity === 'pass') return statusIcon.success;
  if (severity === 'warn') return statusIcon.warning;
  if (severity === 'fail') return statusIcon.error;
  return statusIcon.info;
}

function colorLabel(severity: Severity, label: string): string {
  if (severity === 'pass') return chalk.white(label);
  if (severity === 'warn') return chalk.yellow(label);
  if (severity === 'fail') return chalk.red(label);
  return chalk.white(label);
}

export function renderReport(checks: DoctorCheck[], projectDir: string): void {
  console.log(style.heading('\nFeather doctor\n'));
  console.log(style.muted(`Project: ${projectDir}\n`));

  const groups = [...new Set(checks.map((check) => check.group))];
  for (const group of groups) {
    console.log(chalk.bold(group));
    for (const check of checks.filter((item) => item.group === group).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])) {
      console.log(`  ${icon(check.severity)} ${colorLabel(check.severity, check.label)}${check.detail ? chalk.dim(`  ${check.detail}`) : ''}`);
      if (check.fix) console.log(chalk.dim(`    → ${check.fix}`));
    }
    console.log();
  }

  const failures = checks.filter((check) => check.severity === 'fail');
  const warnings = checks.filter((check) => check.severity === 'warn');
  const passed = checks.filter((check) => check.severity === 'pass');

  if (failures.length > 0) {
    console.log(chalk.red.bold(`Doctor found ${failures.length} blocker${failures.length === 1 ? '' : 's'}.`));
  } else if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`Doctor passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`));
  } else {
    console.log(chalk.green.bold('Doctor found no problems.'));
  }
  console.log(chalk.dim(`${passed.length} passed, ${warnings.length} warnings, ${failures.length} failures.\n`));
}

