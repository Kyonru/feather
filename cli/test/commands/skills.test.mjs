/* eslint-disable no-undef */
import {
  assert,
  existsSync,
  join,
  makeTmp,
  outputOf,
  readFileSync,
  run,
  test,
  writeFileSync,
} from './helpers.mjs';

const EXPECTED_SKILLS = [
  'feather-project-context',
  'feather-mcp-live-sessions',
  'feather-step-debugging',
  'feather-logs-observability',
  'feather-performance-profiling',
  'feather-session-replay-qa',
  'feather-shader-graph',
  'feather-particle-effects',
  'feather-texture-lab',
  'feather-plugin-iteration',
  'feather-debug-builds',
  'feather-release-builds',
  'feather-qa-playtester',
];

function runOk(args) {
  const result = run(args);
  assert.equal(result.exitCode, 0, outputOf(result));
  return result;
}

function parseJson(result) {
  assert.equal(result.stderr, '', outputOf(result));
  return JSON.parse(result.stdout);
}

function installedSkillPath(dir, id) {
  return join(dir, '.agents', 'skills', id, 'SKILL.md');
}

test('skills list shows all bundled skills as JSON', () => {
  const result = runOk(['skills', 'list', '--json']);
  const payload = parseJson(result);

  assert.equal(payload.count, EXPECTED_SKILLS.length);
  assert.deepEqual(
    payload.skills.map((skill) => skill.id),
    EXPECTED_SKILLS,
  );
  assert.equal(payload.skills.every((skill) => typeof skill.description === 'string'), true);
});

test('skills info prints metadata and default install path', () => {
  const result = runOk(['skills', 'info', 'feather-step-debugging', '--json']);
  const payload = parseJson(result);

  assert.equal(payload.skill.id, 'feather-step-debugging');
  assert.equal(payload.skill.title, 'Feather Step Debugging');
  assert.match(payload.installPath, /\.agents[/\\]skills[/\\]feather-step-debugging$/);
  assert.match(payload.sourcePath, /cli[/\\]skills[/\\]feather-step-debugging$/);
});

test('skills install writes SKILL.md into project-local .agents directory', () => {
  const dir = makeTmp();
  const result = runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--json']);
  const payload = parseJson(result);

  assert.equal(payload.targetDir, join(dir, '.agents', 'skills'));
  assert.equal(payload.installed.length, 1);
  assert.equal(payload.installed[0].id, 'feather-step-debugging');
  assert.equal(existsSync(installedSkillPath(dir, 'feather-step-debugging')), true);
  assert.match(readFileSync(installedSkillPath(dir, 'feather-step-debugging'), 'utf8'), /# Feather Step Debugging/);
});

test('skills install skips existing skills unless forced', () => {
  const dir = makeTmp();
  runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--json']);
  const skip = parseJson(runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--json']));

  assert.equal(skip.installed.length, 0);
  assert.equal(skip.skipped.length, 1);
  assert.equal(skip.skipped[0].reason, 'exists');

  writeFileSync(installedSkillPath(dir, 'feather-step-debugging'), 'local edit\n');
  const force = parseJson(
    runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--force', '--json']),
  );
  assert.equal(force.installed.length, 1);
  assert.equal(force.installed[0].action, 'overwrite');
  assert.match(readFileSync(installedSkillPath(dir, 'feather-step-debugging'), 'utf8'), /# Feather Step Debugging/);
});

test('skills install dry-run does not write files', () => {
  const dir = makeTmp();
  const payload = parseJson(
    runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--dry-run', '--json']),
  );

  assert.equal(payload.dryRun, true);
  assert.equal(payload.installed.length, 1);
  assert.equal(payload.installed[0].dryRun, true);
  assert.equal(existsSync(installedSkillPath(dir, 'feather-step-debugging')), false);
});

test('skills install reports a clear error for a missing project directory', () => {
  const dir = join(makeTmp(), 'missing');
  const result = run(['skills', 'install', 'feather-step-debugging', '--dir', dir]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Project directory does not exist/);
  assert.match(result.stderr, /missing/);
});

test('skills install --all installs the full catalog', () => {
  const dir = makeTmp();
  const payload = parseJson(runOk(['skills', 'install', '--all', '--dir', dir, '--json']));

  assert.equal(payload.installed.length, EXPECTED_SKILLS.length);
  assert.deepEqual(
    payload.installed.map((skill) => skill.id),
    EXPECTED_SKILLS,
  );
  for (const id of EXPECTED_SKILLS) {
    assert.equal(existsSync(installedSkillPath(dir, id)), true, id);
  }
});

test('skills remove removes installed catalog skills only', () => {
  const dir = makeTmp();
  runOk(['skills', 'install', 'feather-step-debugging', 'feather-texture-lab', '--dir', dir, '--json']);

  const payload = parseJson(runOk(['skills', 'remove', 'feather-step-debugging', '--dir', dir, '--json']));
  assert.equal(payload.removed.length, 1);
  assert.equal(payload.removed[0].id, 'feather-step-debugging');
  assert.equal(existsSync(installedSkillPath(dir, 'feather-step-debugging')), false);
  assert.equal(existsSync(installedSkillPath(dir, 'feather-texture-lab')), true);

  const missing = parseJson(runOk(['skills', 'remove', 'feather-step-debugging', '--dir', dir, '--json']));
  assert.equal(missing.removed.length, 0);
  assert.equal(missing.skipped[0].reason, 'missing');
});

test('skills remove dry-run leaves installed files in place', () => {
  const dir = makeTmp();
  runOk(['skills', 'install', 'feather-step-debugging', '--dir', dir, '--json']);
  const payload = parseJson(
    runOk(['skills', 'remove', 'feather-step-debugging', '--dir', dir, '--dry-run', '--json']),
  );

  assert.equal(payload.dryRun, true);
  assert.equal(payload.removed[0].dryRun, true);
  assert.equal(existsSync(installedSkillPath(dir, 'feather-step-debugging')), true);
});
