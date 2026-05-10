#!/usr/bin/env node
/* eslint-disable no-undef */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamePath = join(root, 'src-lua');

function findOnPath(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function findLove() {
  if (process.env.LOVE_BIN && existsSync(process.env.LOVE_BIN)) return process.env.LOVE_BIN;
  if (process.platform === 'darwin' && existsSync('/Applications/love.app/Contents/MacOS/love')) {
    return '/Applications/love.app/Contents/MacOS/love';
  }
  return findOnPath('love') ?? findOnPath('love2d');
}

const love = findLove();
if (!love) {
  console.error('lua-e2e: LÖVE binary not found. Install love or set LOVE_BIN.');
  process.exit(1);
}

const args = [gamePath, '--e2e'];
let command = love;
let commandArgs = args;

if (process.platform === 'linux' && !process.env.DISPLAY) {
  const xvfb = findOnPath('xvfb-run');
  if (xvfb) {
    command = xvfb;
    commandArgs = ['-a', love, ...args];
  }
}

console.log(`lua-e2e: ${command} ${commandArgs.join(' ')}`);
const result = spawnSync(command, commandArgs, {
  cwd: root,
  encoding: 'utf8',
  timeout: 15000,
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.error) {
  console.error(`lua-e2e: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`lua-e2e: LÖVE exited with status ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!output.includes('LUA_E2E_PASS')) {
  console.error('lua-e2e: PASS marker was not found in output.');
  process.exit(1);
}

console.log('lua-e2e: passed');
