#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * `pnpm run up` — bring a whole Feather development session online.
 *
 * Starting a realistic session by hand means three or four terminals: the
 * Inspector shell, maybe Studio, a CLI build, and a game launched against them
 * in the right order. The ordering is the part that bites — a game started
 * before Inspector's WebSocket server is listening simply never connects, and
 * looks like a bug rather than a race.
 *
 * So this waits for the socket instead of sleeping, reuses anything already
 * running rather than fighting it for a port, and shuts the whole tree down on
 * one Ctrl+C.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE_ROOT = join(ROOT, 'packages/runtime-lua/example');

/** Inspector's game WebSocket. A game is connectable exactly when this listens. */
const INSPECTOR_PORT = Number(process.env.FEATHER_PORT ?? 4004);
/** Studio's Vite dev server, which its Tauri shell waits on. */
const STUDIO_PORT = 1430;

/** Tauri's first run compiles the Rust shell, which is not quick. */
const READY_TIMEOUT_MS = 15 * 60 * 1000;

// --- terminal -------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `[${code}m${text}[0m` : text);
const bold = (t) => paint('1', t);
const dim = (t) => paint('2', t);

// One color per process so interleaved output stays readable.
const TAGS = {
  inspector: (t) => paint('36', t),
  studio: (t) => paint('35', t),
  game: (t) => paint('32', t),
  up: (t) => paint('33', t),
};

function log(tag, message) {
  const color = TAGS[tag] ?? ((t) => t);
  process.stdout.write(`${color(`[${tag}]`)} ${message}\n`);
}

// --- examples -------------------------------------------------------------

/** Every directory under example/ holding a main.lua, including nested ones. */
function findExamples(dir = EXAMPLE_ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, 'main.lua'))) found.push(full);
    findExamples(full, found);
  }
  return found.sort();
}

const describe = (path) => relative(EXAMPLE_ROOT, path);

function resolveExample(examples, requested) {
  if (!requested) return null;
  const wanted = requested.replace(/^packages\/runtime-lua\/example\//, '').replace(/\/$/, '');
  const exact = examples.find((e) => describe(e) === wanted);
  if (exact) return exact;

  const partial = examples.filter((e) => describe(e).includes(wanted));
  if (partial.length === 1) return partial[0];

  if (partial.length > 1) {
    log('up', `"${requested}" matches ${partial.length} examples:`);
    for (const e of partial) log('up', `    ${describe(e)}`);
    process.exit(1);
  }

  log('up', `No example named "${requested}".`);
  log('up', 'Available:');
  for (const e of examples) log('up', `    ${describe(e)}`);
  process.exit(1);
}

async function pickExample(examples) {
  const withConfig = new Set(
    examples.filter((e) => existsSync(join(e, 'feather.config.lua'))).map(describe),
  );

  process.stdout.write(`\n${bold('Which example should the game run?')}\n\n`);
  examples.forEach((example, index) => {
    const name = describe(example);
    const note = withConfig.has(name) ? dim('  (has feather.config.lua)') : '';
    process.stdout.write(`  ${String(index + 1).padStart(2)}. ${name}${note}\n`);
  });
  process.stdout.write(`\n  ${dim('0. no game — just the apps')}\n\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((done) => {
    rl.question(`Choose ${dim('[1]')} `, (value) => {
      rl.close();
      done(value.trim());
    });
  });

  if (answer === '0') return null;
  if (answer === '') return examples[0];

  const index = Number(answer);
  if (!Number.isInteger(index) || index < 1 || index > examples.length) {
    log('up', `"${answer}" is not one of the choices.`);
    process.exit(1);
  }
  return examples[index - 1];
}

// --- readiness ------------------------------------------------------------

function probe(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const settle = (open) => {
      socket.destroy();
      done(open);
    };
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
    socket.setTimeout(1000, () => settle(false));
  });
}

async function waitForPort(port, label, isAlive) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let announced = false;

  while (Date.now() < deadline) {
    if (await probe(port)) return true;
    if (isAlive && !isAlive()) {
      log('up', `${label} exited before it started listening on ${port}.`);
      return false;
    }
    if (!announced) {
      log('up', `waiting for ${label} on port ${port} ${dim('(first run compiles Rust)')}`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  log('up', `${label} did not listen on ${port} within ${READY_TIMEOUT_MS / 60000} minutes.`);
  return false;
}

// --- child processes ------------------------------------------------------

const children = [];
let shuttingDown = false;

function start(tag, command, args, options = {}) {
  // Own process group, so a Ctrl+C here takes down the whole tree. Tauri spawns
  // cargo which spawns the app; killing only the direct child orphans the rest.
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: useColor ? '1' : '0' },
    ...options,
  });

  const prefix = (stream) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) log(tag, line);
    });
  };
  prefix(child.stdout);
  prefix(child.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const how = signal ? `signal ${signal}` : `code ${code}`;
    log(tag, dim(`exited (${how})`));
    // The apps are the session. If one dies unexpectedly, stop pretending.
    if (tag !== 'game') shutdown(code === 0 ? 0 : 1);
  });

  children.push({ tag, child });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write('\n');
  log('up', 'shutting down…');

  for (const { tag, child } of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        log('up', dim(`could not signal ${tag}`));
      }
    }
  }

  // Give them a moment to close sockets, then insist.
  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    process.exit(code);
  }, 2000).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// --- main -----------------------------------------------------------------

function parseArgs(argv) {
  const options = { studio: false, game: true, example: null, list: false, help: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--studio') options.studio = true;
    else if (arg === '--no-game') options.game = false;
    else if (arg === '--list') options.list = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--example') options.example = argv[++i];
    else if (arg.startsWith('-')) {
      log('up', `Unknown option "${arg}". Try --help.`);
      process.exit(1);
    } else options.example = arg;
  }
  return options;
}

const HELP = `
${bold('pnpm run up')} — start Inspector, optionally Studio, and a game connected to them.

${bold('Usage')}
  pnpm run up [example] [options]

${bold('Options')}
  --studio        also start Feather Studio
  --no-game       start the apps only
  --example <n>   choose the example explicitly
  --list          print the runnable examples and exit
  --verbose       pass --verbose to the game
  -h, --help      this text

${bold('Examples')}
  pnpm run up                     pick an example interactively
  pnpm run up demo                run packages/runtime-lua/example/demo
  pnpm run up session_replay/single_player
  pnpm run up test_cli --studio   the full three-process session

Anything already running is reused rather than started twice, so you can leave
Inspector open and re-run this to swap games.
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const examples = findExamples();

  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (options.list) {
    for (const example of examples) process.stdout.write(`${describe(example)}\n`);
    return;
  }

  let example = null;
  if (options.game) {
    example = resolveExample(examples, options.example);
    if (!example) {
      // A non-interactive shell cannot answer a prompt; take the first example.
      example = process.stdin.isTTY ? await pickExample(examples) : examples[0];
    }
  }

  // Build the CLI once up front. `pnpm run feather` would rebuild on every
  // invocation, and the game launch should not wait for that twice.
  if (example) {
    log('up', 'building the CLI…');
    const build = spawnSync('pnpm', ['run', 'cli:build'], { cwd: ROOT, stdio: 'inherit' });
    if (build.status !== 0) {
      log('up', 'CLI build failed.');
      process.exit(build.status ?? 1);
    }
  }

  const inspectorUp = await probe(INSPECTOR_PORT);
  if (inspectorUp) {
    log('up', `Inspector already listening on ${INSPECTOR_PORT} — reusing it.`);
  } else {
    log('up', 'starting Inspector…');
    start('inspector', 'pnpm', ['run', 'inspector:tauri']);
  }

  if (options.studio) {
    if (await probe(STUDIO_PORT)) {
      log('up', `Studio already running on ${STUDIO_PORT} — reusing it.`);
    } else {
      log('up', 'starting Studio…');
      start('studio', 'pnpm', ['run', 'studio:tauri']);
    }
  }

  if (!example) {
    log('up', 'apps only — no game requested.');
    return;
  }

  const alive = () => children.some(({ tag, child }) => tag === 'inspector' && child.exitCode === null);
  if (!inspectorUp && !(await waitForPort(INSPECTOR_PORT, 'Inspector', alive))) {
    shutdown(1);
    return;
  }

  const name = describe(example);
  log('up', `Inspector is listening — launching ${bold(name)}`);

  const args = ['apps/cli/dist/index.js', 'run', relative(ROOT, example), '--session-name', name];
  if (options.verbose) args.push('--verbose');
  start('game', process.execPath, args);

  log('up', dim('Ctrl+C stops everything.'));
}

main().catch((error) => {
  log('up', String(error?.stack ?? error));
  shutdown(1);
});
