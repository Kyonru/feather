/* eslint-disable no-undef */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, join, makeTmp, outputOf, run, symlinkSync, test } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

function runOk(args) {
  const result = run(args);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.length > 0);
  return result.stdout;
}

test('help: core commands render help text', () => {
  assert.match(runOk(['--help']), /Usage:/);
  assert.match(runOk(['doctor', '--help']), /doctor/);
  assert.match(runOk(['plugin', '--help']), /plugin/);
  assert.match(runOk(['mcp', '--help']), /Model Context Protocol/);
  assert.match(runOk(['mcp', 'setup', '--help']), /codex or claude/);
  assert.match(runOk(['session', '--help']), /without MCP/);
  assert.match(runOk(['logs', 'export', '--help']), /captured logs/);
  assert.match(runOk(['replay', 'list', '--help']), /Session Replay recordings/);
  assert.match(runOk(['skills', '--help']), /Install Feather agent skills/);
});

test('help: symlinked global bin executes CLI', () => {
  const bin = join(makeTmp(), 'feather');
  symlinkSync(CLI, bin);

  const result = spawnSync(process.execPath, [bin, '--help'], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });

  assert.equal(
    result.status,
    0,
    outputOf({
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    }),
  );
  assert.match(result.stdout ?? '', /Usage:/);
});
