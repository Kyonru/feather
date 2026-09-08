/* eslint-disable no-undef */
import { assert, existsSync, join, makeTmp, outputOf, readFileSync, run, test, writeFileSync, writeGame } from './helpers.mjs';

test('replay init: creates centralized adapter and enables session-replay plugin', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  managed = "cli",
  include = { "shader-graph" },
  capabilities = { "draw" },
}
`,
  );

  const result = run(['replay', 'init', '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));

  const adapterPath = join(dir, 'dev', 'replay.lua');
  assert.equal(existsSync(adapterPath), true, 'adapter file should be created');
  const adapter = readFileSync(adapterPath, 'utf8');
  assert.match(adapter, /replayRegister/);
  assert.match(adapter, /initialStates/);
  assert.match(adapter, /function M\.start/);
  assert.match(adapter, /local STREAM = "game"/);

  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.match(config, /include\s*=\s*\{\s*"session-replay",\s*"shader-graph"\s*\}/);
  assert.match(config, /capabilities\s*=\s*\{\s*"binary",\s*"draw",\s*"filesystem",\s*"input"\s*\}/);
});

test('replay init: refuses to overwrite without force', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { managed = "cli" }\n');

  const first = run(['replay', 'init', '--dir', dir]);
  assert.equal(first.exitCode, 0, outputOf(first));

  const second = run(['replay', 'init', '--dir', dir]);
  assert.equal(second.exitCode, 1, outputOf(second));
  assert.match(outputOf(second), /Replay adapter already exists/);
});

test('replay init: supports custom path and no config update', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { include = { "shader-graph" } }\n');

  const result = run(['replay', 'init', '--dir', dir, '--path', 'tools/replay_adapter.lua', '--no-config']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'tools', 'replay_adapter.lua')), true);
  assert.doesNotMatch(readFileSync(join(dir, 'feather.config.lua'), 'utf8'), /session-replay/);
});
