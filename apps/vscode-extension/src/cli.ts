import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import type { CliInvocation } from './jobs/runner';
import type { TerminalPlan } from './plans';

/**
 * The CLI this extension runs: the platform binary it bundles, or — in a
 * development build, where prepare.mjs writes no binaries — the workspace CLI
 * through `bundled-bin/feather-dev.mjs`. Never the user's PATH (V4.md D6).
 */
export function cliInvocation(extensionPath: string): CliInvocation {
  const devLauncher = join(extensionPath, 'bundled-bin', 'feather-dev.mjs');
  if (existsSync(devLauncher)) {
    return { command: 'node', argsPrefix: [devLauncher] };
  }

  const p = os.platform();
  const a = os.arch();
  const name =
    p === 'darwin' && a === 'arm64' ? 'feather' :
    p === 'darwin' ? 'feather-darwin-x64' :
    p === 'win32' ? 'feather-win-x64.exe' : 'feather-linux-x64';
  return { command: join(extensionPath, 'bundled-bin', name), argsPrefix: [] };
}

/**
 * Run a long-lived, interactive command (`run`, `watch`) in a terminal whose
 * process *is* the CLI — no shell, so no quoting, and `exitStatus` tells us
 * whether it is still running. A terminal that is still running is never
 * disposed without asking: it may be a game session or a watch loop.
 */
export async function runInTerminal(context: vscode.ExtensionContext, plan: TerminalPlan, cwd: string): Promise<vscode.Terminal | undefined> {
  const existing = vscode.window.terminals.find((terminal) => terminal.name === plan.name);
  if (existing) {
    if (existing.exitStatus === undefined) {
      const choice = await vscode.window.showWarningMessage(`${plan.name} is still running.`, 'Show', 'Restart');
      if (choice === 'Show') {
        existing.show();
        return existing;
      }
      if (choice !== 'Restart') return undefined;
    }
    existing.dispose();
  }

  const cli = cliInvocation(context.extensionPath);
  const terminal = vscode.window.createTerminal({
    name: plan.name,
    cwd,
    shellPath: cli.command,
    shellArgs: [...cli.argsPrefix, ...plan.args],
  });
  terminal.show();
  return terminal;
}

/**
 * The platform snapshot this extension vendors.
 *
 * The extension does not call the user's CLI — it bundles its own binaries and
 * Lua runtime. That makes it hermetic, but it also means the versions it carries
 * are invisible unless it says so. `prepare.mjs` writes this at package time and
 * fails the build if the manifest and the bundled snapshot disagree.
 */
export function bundledPlatform(extensionPath: string): {
  featherPlatform: string;
  cli: string;
  runtime: string;
} | null {
  try {
    const file = join(extensionPath, 'bundled-bin', 'platform.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
