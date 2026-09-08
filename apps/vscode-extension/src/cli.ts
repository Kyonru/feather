import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import { shellQuote } from './command';

interface CliInvocation {
  command: string;
  argsPrefix: string[];
}

function getCliInvocation(context: vscode.ExtensionContext): CliInvocation {
  const devLauncher = join(context.extensionPath, 'bundled-bin', 'feather-dev.mjs');
  if (existsSync(devLauncher)) {
    return { command: 'node', argsPrefix: [devLauncher] };
  }

  const p = os.platform();
  const a = os.arch();
  const name =
    p === 'darwin' && a === 'arm64' ? 'feather' :
    p === 'darwin' ? 'feather-darwin-x64' :
    p === 'win32' ? 'feather-win-x64.exe' : 'feather-linux-x64';
  return { command: join(context.extensionPath, 'bundled-bin', name), argsPrefix: [] };
}

export function runInTerminal(
  context: vscode.ExtensionContext,
  name: string,
  args: string[],
  cwd: string,
): vscode.Terminal {
  return runCommandsInTerminal(context, name, [args], cwd);
}

export function runCommandsInTerminal(
  context: vscode.ExtensionContext,
  name: string,
  commands: string[][],
  cwd: string,
): vscode.Terminal {
  const cli = getCliInvocation(context);
  const existing = vscode.window.terminals.find((t) => t.name === name);
  existing?.dispose();
  const terminal = vscode.window.createTerminal({ name, cwd });
  for (const args of commands) {
    terminal.sendText([cli.command, ...cli.argsPrefix, ...args].map(shellQuote).join(' '));
  }
  terminal.show();
  return terminal;
}

export function spawnFeather(
  context: vscode.ExtensionContext,
  args: string[],
  cwd: string,
): ChildProcess {
  const cli = getCliInvocation(context);
  return spawn(cli.command, [...cli.argsPrefix, ...args], { cwd, shell: false });
}

/**
 * The platform snapshot this extension vendors.
 *
 * The extension does not call the user's CLI — it bundles its own binaries and
 * Lua runtime. That makes it hermetic, but it also means the versions it carries
 * are invisible unless it says so. `prepare.mjs` writes this at package time and
 * fails the build if the manifest and the bundled snapshot disagree.
 */
export function bundledPlatform(context: vscode.ExtensionContext): {
  featherPlatform: string;
  cli: string;
  runtime: string;
} | null {
  try {
    const file = join(context.extensionPath, 'bundled-bin', 'platform.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
