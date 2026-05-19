/* eslint-disable no-undef */
import {
  assert,
  join,
  makeTmp,
  outputOf,
  readFileSync,
  run,
  test,
  writeFileSync,
  writeGame,
} from './helpers.mjs';

test('config plugins: adds included plugins and merges required capabilities', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  sessionName = "Config Game",
  pluginOptions = {
    console = { evalEnabled = true },
  },
  capabilities = { "logs" },
  include = { "runtime-snapshot" },
}
`,
  );

  const result = run(['config', 'plugins', '--dir', dir, '--include', 'console,input-replay']);
  assert.equal(result.exitCode, 0, outputOf(result));

  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.match(config, /sessionName\s*=\s*"Config Game"/);
  assert.match(config, /pluginOptions\s*=\s*\{/);
  assert.match(config, /evalEnabled\s*=\s*true/);
  assert.match(config, /include\s*=\s*\{\s*"console",\s*"input-replay",\s*"runtime-snapshot"\s*\}/);
  assert.match(config, /capabilities\s*=\s*\{\s*"filesystem",\s*"input",\s*"logs"\s*\}/);
});

test('config plugins: resolves parent config when dir points at nested game main.lua', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { include = { "runtime-snapshot" } }\n');

  const result = run(['config', 'plugins', '--dir', gameDir, '--include', 'console']);
  assert.equal(result.exitCode, 0, outputOf(result));

  assert.match(readFileSync(join(dir, 'feather.config.lua'), 'utf8'), /include\s*=\s*\{\s*"console",\s*"runtime-snapshot"\s*\}/);
});

test('config plugins: exclude removes included plugin and writes exclude list', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    'return { include = { "console", "input-replay" }, exclude = { "bookmark" }, capabilities = { "filesystem", "input" } }\n',
  );

  const result = run(['config', 'plugins', '--dir', dir, '--exclude', 'console,hot-reload']);
  assert.equal(result.exitCode, 0, outputOf(result));

  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.match(config, /include\s*=\s*\{\s*"input-replay"\s*\}/);
  assert.match(config, /exclude\s*=\s*\{\s*"bookmark",\s*"console",\s*"hot-reload"\s*\}/);
  assert.match(config, /capabilities\s*=\s*\{\s*"filesystem",\s*"input"\s*\}/);
});

test('config plugins: missing config fails with init guidance', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['config', 'plugins', '--dir', dir, '--include', 'console']);
  assert.equal(result.exitCode, 1, outputOf(result));
  assert.match(outputOf(result), /No feather\.config\.lua found/);
  assert.match(outputOf(result), /feather init/);
});

test('config plugins: unknown plugin is rejected', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { sessionName = "Config Game" }\n');

  const result = run(['config', 'plugins', '--dir', dir, '--include', 'not-a-plugin']);
  assert.equal(result.exitCode, 1, outputOf(result));
  assert.match(outputOf(result), /Unknown plugin: not-a-plugin/);
});
