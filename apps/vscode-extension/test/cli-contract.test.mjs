import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Every argv the extension builds is checked against the compiled CLI's own
// Commander tree (apps/cli/dist). Two checks per plan:
//   1. structural — the subcommand exists, every flag is one it declares, flags
//      that take a value get one, and there are no more positionals than it
//      accepts (Commander 12 silently ignores extras, which is how
//      `build vendor list <dir>` listed the wrong project);
//   2. semantic — the CLI's parser, with the action swapped for a recorder,
//      receives each value under the option the extension meant.

const require = createRequire(import.meta.url);
const plans = require('../out/plans.js');
const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(extensionRoot, '..', '..');
const cliDist = join(repoRoot, 'apps', 'cli', 'dist');
const { createProgram } = await import(pathToFileURL(join(cliDist, 'index.js')).href);

const ROOT = '/tmp/My Game';

function argvsOf(plan) {
  return plan.steps.map((step) => step.args);
}

/** Every plan the extension can build, across the choices its pickers offer. */
function allArgvs() {
  const out = [];
  const add = (label, argvs) => argvs.forEach((args) => out.push({ label, args }));

  for (const mode of ['cli', 'auto', 'manual']) {
    add(`init ${mode} defaults`, argvsOf(plans.initPlan(ROOT, { mode, plugins: { kind: 'ids', ids: ['particle-system-playground', 'shader-graph'] } })));
    add(`init ${mode} cli-default`, argvsOf(plans.initPlan(ROOT, { mode, plugins: { kind: 'cli-default' } })));
  }
  add('init custom remote', argvsOf(plans.initPlan(ROOT, {
    mode: 'cli',
    sessionName: 'My Game',
    security: { kind: 'appId', appId: 'feather-app-1' },
    source: { kind: 'remote', branch: 'v4' },
    plugins: { kind: 'ids', ids: ['hot-reload'] },
    hotReloadAllow: ['game.player'],
  })));
  add('init custom local', argvsOf(plans.initPlan(ROOT, {
    mode: 'auto',
    security: { kind: 'insecure' },
    source: { kind: 'local', path: '/src/runtime-lua' },
    plugins: { kind: 'none' },
  })));

  for (const managed of ['cli', 'auto', null]) {
    for (const action of ['install', 'update', 'remove']) {
      add(`plugins ${action} ${managed}`, argvsOf(plans.pluginsPlan(ROOT, action, ['console', 'hot-reload'], managed, action === 'install' ? ['game'] : [])));
    }
  }
  for (const action of ['install', 'update', 'remove']) add(`packages ${action}`, argvsOf(plans.packagesPlan(ROOT, action, ['anim8', 'baton'])));

  for (const target of ['all', 'web', 'android', 'ios', 'desktop', 'mobile']) {
    add(`vendor add ${target}`, argvsOf(plans.vendorAddPlan(ROOT, [target])));
  }
  add('vendor add custom dir', argvsOf(plans.vendorAddPlan(ROOT, ['web', 'android'], 'third_party/vendor')));
  add('vendor list', argvsOf(plans.vendorListPlan(ROOT)));
  add('vendor list custom dir', argvsOf(plans.vendorListPlan(ROOT, 'third_party')));
  out.push({ label: 'vendor status query', args: plans.vendorStatusArgs(ROOT, 'third_party') });

  for (const target of ['android', 'ios']) {
    add(`release ${target} all options`, argvsOf(plans.releaseBuildPlan(ROOT, target, ['clean', 'dry-run', 'no-cache', 'verbose'])));
    add(`release ${target} json`, argvsOf(plans.releaseBuildPlan(ROOT, target, ['clean'])));
  }
  add('upload existing', argvsOf(plans.uploadPlan(ROOT, { target: 'itch', dryRun: true, channel: 'html5' })));
  for (const buildTarget of ['web', 'windows', 'macos', 'linux', 'android', 'ios', 'steamos']) {
    add(`upload build ${buildTarget}`, argvsOf(plans.uploadPlan(ROOT, { target: 'itch', buildTarget, dryRun: false })));
  }
  add('doctor', argvsOf(plans.doctorPlan(ROOT)));
  add('remove', argvsOf(plans.removePlan(ROOT)));
  add('update', argvsOf(plans.updatePlan(ROOT)));
  for (const args of Object.values(plans.projectStateQueries(ROOT))) out.push({ label: 'state query', args });

  for (const watch of [false, true]) {
    const { plans: runs } = plans.runPlans(ROOT, [...plans.RUN_TARGETS], { watch, love: '/Applications/love.app/Contents/MacOS/love' });
    for (const run of runs) out.push({ label: `${watch ? 'watch' : 'run'} ${run.target}`, args: run.args });
  }
  return out;
}

function findCommand(program, args) {
  let command = program;
  let index = 0;
  while (index < args.length) {
    const sub = command.commands.find((item) => item.name() === args[index] || item.aliases().includes(args[index]));
    if (!sub) break;
    command = sub;
    index += 1;
  }
  return { command, path: args.slice(0, index), rest: args.slice(index) };
}

function findOption(command, token) {
  return command.options.find((option) => option.long === token || option.short === token);
}

/** Structural check; returns the parsed `{ positionals, flags }` for the semantic check. */
function checkStructure(program, label, args) {
  const { command, path, rest } = findCommand(program, args);
  const name = `feather ${path.join(' ')} (${label})`;
  assert.ok(path.length > 0, `${label}: "${args[0]}" is not a CLI command`);
  const positionals = [];
  const flags = [];
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const option = findOption(command, token);
    assert.ok(option, `${name}: unknown option ${token}; it declares ${command.options.map((o) => o.long).join(' ')}`);
    if (option.required || option.optional) {
      const value = rest[i + 1];
      if (option.required) assert.ok(value !== undefined && !value.startsWith('--'), `${name}: ${token} needs a value`);
      if (value !== undefined && !value.startsWith('--')) {
        i += 1;
        flags.push({ option, value });
        while (option.variadic && rest[i + 1] !== undefined && !rest[i + 1].startsWith('-')) i += 1;
        continue;
      }
    }
    flags.push({ option, value: undefined });
  }
  const declared = command.registeredArguments;
  const variadic = declared.some((argument) => argument.variadic);
  assert.ok(
    variadic || positionals.length <= declared.length,
    `${name}: ${positionals.length} positional argument(s) [${positionals.join(', ')}] but it accepts ${declared.length}`,
  );
  const required = declared.filter((argument) => argument.required).length;
  assert.ok(positionals.length >= required, `${name}: needs ${required} positional argument(s)`);
  return { command, path, positionals, flags };
}

function quiet(command) {
  command.exitOverride();
  command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  command.commands.forEach(quiet);
}

/** Parse with the real CLI parser, recording instead of acting. */
async function parseWithCli(path, args) {
  const program = createProgram();
  quiet(program);
  let leaf = program;
  for (const name of path) leaf = leaf.commands.find((item) => item.name() === name);
  let captured;
  leaf.action((...values) => {
    // `plugin` declares --dir on itself and its subcommands, and the CLI merges
    // the parent's options into the subcommand's, so read them merged too.
    captured = { opts: values.at(-1).optsWithGlobals(), positionals: values.slice(0, -2) };
  });
  await program.parseAsync(args, { from: 'user' });
  return captured;
}

const cases = allArgvs();

test('the plan matrix covers every command the extension runs', () => {
  const commands = new Set(cases.map(({ args }) => findCommand(createProgram(), args).path.join(' ')));
  for (const expected of [
    'init', 'plugin install', 'plugin remove', 'plugin update', 'plugin list', 'config plugins', 'config hot-reload',
    'package install', 'package update', 'package remove', 'package list', 'build vendor add', 'build vendor list',
    'build android', 'build ios', 'upload', 'doctor', 'remove', 'update', 'run', 'watch',
  ]) {
    assert.ok(commands.has(expected), `no plan exercises feather ${expected}`);
  }
});

for (const { label, args } of cases) {
  test(`CLI accepts: ${label} — feather ${args.join(' ')}`, async () => {
    const program = createProgram();
    const { path, positionals, flags } = checkStructure(program, label, args);
    const parsed = await parseWithCli(path, args);
    assert.ok(parsed, `${label}: the CLI did not dispatch to feather ${path.join(' ')}`);
    for (const { option, value } of flags) {
      const actual = parsed.opts[option.attributeName()];
      if (option.negate) assert.equal(actual, false, `${label}: ${option.long}`);
      else if (option.variadic) assert.ok(Array.isArray(actual) && actual.includes(value), `${label}: ${option.long}`);
      else if (value === undefined) assert.equal(actual, true, `${label}: ${option.long}`);
      else assert.equal(String(actual), value, `${label}: ${option.long} should carry ${value}`);
    }
    const parsedPositionals = parsed.positionals.flat().filter((item) => item !== undefined);
    assert.deepEqual(parsedPositionals, positionals, `${label}: positionals`);
  });
}

test('the project directory reaches every command that takes one', () => {
  for (const { label, args } of cases) {
    assert.ok(args.includes(ROOT), `${label} does not pass the project directory`);
  }
});

test('init plugin defaults are the CLI\'s, not a copy', async () => {
  const { defaultIncludedPluginIds } = await import(pathToFileURL(join(cliDist, 'ui', 'init', 'model.js')).href);
  const bundled = JSON.parse(readFileSync(join(extensionRoot, 'bundled-bin', 'cli-defaults.json'), 'utf8'));
  assert.deepEqual(bundled.initPlugins, defaultIncludedPluginIds);
});
