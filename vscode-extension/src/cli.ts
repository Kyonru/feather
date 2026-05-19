import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import * as os from 'node:os';
import { shellQuote } from './command';

function getBinaryPath(context: vscode.ExtensionContext): string {
  const p = os.platform();
  const a = os.arch();
  const name =
    p === 'darwin' && a === 'arm64' ? 'feather' :
    p === 'darwin' ? 'feather-darwin-x64' :
    p === 'win32' ? 'feather-win-x64.exe' : 'feather-linux-x64';
  return join(context.extensionPath, 'bundled-bin', name);
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
  const bin = getBinaryPath(context);
  const existing = vscode.window.terminals.find((t) => t.name === name);
  existing?.dispose();
  const terminal = vscode.window.createTerminal({ name, cwd });
  for (const args of commands) {
    terminal.sendText([bin, ...args].map(shellQuote).join(' '));
  }
  terminal.show();
  return terminal;
}

export function spawnFeather(
  context: vscode.ExtensionContext,
  args: string[],
  cwd: string,
): ChildProcess {
  return spawn(getBinaryPath(context), args, { cwd, shell: false });
}
