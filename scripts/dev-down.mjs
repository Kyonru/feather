#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * `pnpm run down` — stop sessions previously started by `pnpm run up`.
 *
 * The session records contain only process IDs and command markers. Before a
 * signal is sent, the live command line must still contain those markers; this
 * keeps a stale PID from terminating an unrelated process after PID reuse.
 */

import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  commandHasMarkers,
  isProcessAlive,
  readDevSessionEntries,
  readProcessCommand,
  removeDevSession,
} from './dev-session.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_MARKERS = ['scripts/dev-up.mjs'];
const GRACE_MS = 4_000;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (text) => paint('2', text);

function log(message) {
  process.stdout.write(`${paint('33', '[down]')} ${message}\n`);
}

function help() {
  process.stdout.write(`
${paint('1', 'pnpm run down')} — stop every session started by pnpm run up.

${paint('1', 'Usage')}
  pnpm run down

Only processes started by pnpm run up are stopped. Inspector or Studio instances
that up found already running are reused, not owned, and remain running.
\n`);
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function expectedProcess(pid, markers) {
  if (!isProcessAlive(pid)) return { alive: false, matches: false, command: '' };
  const command = readProcessCommand(pid);
  return { alive: true, matches: commandHasMarkers(command, markers), command };
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(child, force = false) {
  const state = expectedProcess(child.pid, child.markers);
  if (!state.alive) return { stopped: true, refused: false };
  if (!state.matches) {
    log(`refusing to signal stale ${child.tag} PID ${child.pid}: ${state.command || 'command unavailable'}`);
    return { stopped: false, refused: true };
  }

  if (process.platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T'];
    if (force) args.push('/F');
    const result = spawnSync('taskkill.exe', args, { stdio: 'ignore', windowsHide: true });
    return { stopped: result.status === 0 || !isProcessAlive(child.pid), refused: false };
  }

  const signal = force ? 'SIGKILL' : 'SIGTERM';
  try {
    process.kill(-child.pid, signal);
    return { stopped: true, refused: false };
  } catch {
    return { stopped: signalPid(child.pid, signal), refused: false };
  }
}

async function stopSession(session) {
  const owner = expectedProcess(session.ownerPid, OWNER_MARKERS);
  let refused = false;

  if (owner.alive && owner.matches) {
    log(`stopping session ${session.ownerPid} (${session.children.map((child) => child.tag).join(', ')})…`);
    signalPid(session.ownerPid, 'SIGTERM');
  } else {
    if (owner.alive) {
      refused = true;
      log(`refusing to signal stale owner PID ${session.ownerPid}: ${owner.command || 'command unavailable'}`);
    } else {
      log(`cleaning orphaned session ${session.ownerPid}…`);
    }
    for (const child of session.children) {
      const result = signalGroup(child);
      refused ||= result.refused;
    }
  }

  const deadline = Date.now() + GRACE_MS;
  while (Date.now() < deadline) {
    const ownerAlive = isProcessAlive(session.ownerPid);
    const childAlive = session.children.some((child) => isProcessAlive(child.pid));
    if (!ownerAlive && !childAlive) break;
    await sleep(100);
  }

  for (const child of session.children) {
    if (!isProcessAlive(child.pid)) continue;
    const result = signalGroup(child, true);
    refused ||= result.refused;
  }

  if (!isProcessAlive(session.ownerPid) && session.children.every((child) => !isProcessAlive(child.pid))) {
    removeDevSession(ROOT, session.ownerPid);
  }

  return refused;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    help();
    return;
  }
  if (args.length > 0) {
    log(`Unknown option "${args[0]}". Try --help.`);
    process.exitCode = 1;
    return;
  }

  const entries = readDevSessionEntries(ROOT);
  if (entries.length === 0) {
    log('No pnpm run up sessions are running.');
    return;
  }

  let refused = false;
  let stopped = 0;
  for (const entry of entries) {
    if (!entry.session) {
      log(`removing unreadable session record ${entry.path} ${dim(`(${entry.error})`)}`);
      rmSync(entry.path, { force: true });
      continue;
    }
    refused ||= await stopSession(entry.session);
    stopped += 1;
  }

  if (stopped > 0) log(`Stopped ${stopped} pnpm run up session${stopped === 1 ? '' : 's'}.`);
  if (refused) {
    log('Some stale PIDs were left untouched because their commands did not match the session record.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log(String(error?.stack ?? error));
  process.exitCode = 1;
});
