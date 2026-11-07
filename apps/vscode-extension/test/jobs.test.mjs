/* global AbortController */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Job lifecycle against a real child process: completion is the exit, a
// failure stops the sequence and carries the CLI's own message, cancellation
// kills the process, and --json steps hand back structured output.

const require = createRequire(import.meta.url);
const { runJob, parseJsonOutput } = require('../out/jobs/runner.js');
const { summarize, summarizeJson, renderJsonForOutput } = require('../out/jobs/summary.js');

const fakeCli = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-cli.mjs');
const invocation = { command: process.execPath, argsPrefix: [fakeCli] };
const cwd = tmpdir();

test('a job runs its steps in order and succeeds on exit 0', async () => {
  const output = [];
  const started = [];
  const result = await runJob(invocation, { title: 'Two steps', cwd, steps: [{ args: ['ok', 'one'] }, { args: ['ok', 'two'] }] }, {
    events: { onOutput: (text) => output.push(text), onStepStart: (index) => started.push(index) },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.exitCode, 0);
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(result.steps.map((step) => step.stdout.trim()), ['ran one', 'ran two']);
  assert.match(output.join(''), /ran one[\s\S]*ran two/);
});

test('a failing step stops the job and reports the CLI error with its exit code', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'feather-jobs-')), 'calls.log');
  try {
    const result = await runJob(
      invocation,
      { title: 'Install', cwd, steps: [{ args: ['ok', 'first'] }, { args: ['fail'] }, { args: ['ok', 'never'] }] },
      { env: { ...process.env, FAKE_CLI_LOG: log } },
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.exitCode, 3);
    assert.equal(result.failedStep, 1);
    assert.equal(result.message, 'Unknown plugin: nope (exit code 3)');
    assert.equal(result.steps.length, 2, 'the step after the failure must not run');
    assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['ok first', 'fail']);
    assert.equal(summarize(result), 'Install failed: Unknown plugin: nope (exit code 3)');
  } finally {
    rmSync(dirname(log), { recursive: true, force: true });
  }
});

test('cancelling a job kills the running process and reports cancelled', async () => {
  const controller = new AbortController();
  const started = Date.now();
  const pending = runJob(invocation, { title: 'Long build', cwd, steps: [{ args: ['hang'] }, { args: ['ok', 'after'] }] }, {
    signal: controller.signal,
    killGraceMs: 500,
    events: {
      onOutput: (text) => {
        if (text.includes('started')) controller.abort();
      },
    },
  });
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.steps.length, 1);
  assert.notEqual(result.steps[0].signal ?? result.steps[0].exitCode, 0);
  assert.ok(Date.now() - started < 5000, 'cancel must not wait for the process to finish on its own');
});

test('an already-cancelled job starts nothing', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runJob(invocation, { title: 'Nothing', cwd, steps: [{ args: ['ok'] }] }, { signal: controller.signal });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.steps.length, 0);
});

test('stdin is closed so an unexpected prompt fails instead of hanging', async () => {
  const result = await runJob(invocation, { title: 'Prompt', cwd, steps: [{ args: ['stdin'] }] });
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 4);
});

test('a --json step returns the parsed document, even after a status line', async () => {
  const clean = await runJob(invocation, { title: 'Initialize Feather (cli mode)', cwd, steps: [{ args: ['json'], json: true }] });
  assert.deepEqual(clean.json, { projectDir: '/p', mode: 'cli', configCreated: true, plugins: ['console'] });
  assert.equal(summarize(clean), 'Initialize Feather (cli mode): Initialized in cli mode with console.');

  const noisy = await runJob(invocation, { title: 'Install', cwd, steps: [{ args: ['noisy-json'], json: true }] });
  assert.deepEqual(noisy.json, { installed: [{ id: 'console' }], skipped: [] });
});

test('a CLI that cannot start is a failure with an actionable message', async () => {
  const result = await runJob({ command: join(cwd, 'no-such-feather-binary'), argsPrefix: [] }, { title: 'Doctor', cwd, steps: [{ args: ['doctor'] }] });
  assert.equal(result.status, 'failed');
  assert.match(result.message, /Could not start the Feather CLI/);
});

test('output is uncoloured for the output channel', async () => {
  const result = await runJob(invocation, { title: 'Env', cwd, steps: [{ args: ['env'], json: true }] });
  assert.deepEqual(result.json, { NO_COLOR: '1' });
});

test('parseJsonOutput tolerates empty and non-JSON output', () => {
  assert.equal(parseJsonOutput(''), undefined);
  assert.equal(parseJsonOutput('Done!\n'), undefined);
  assert.deepEqual(parseJsonOutput('{"a":1}'), { a: 1 });
});

test('summaries come from the shapes the CLI prints', () => {
  assert.equal(summarizeJson({ failures: 1, warnings: 2, checks: [] }), 'Doctor found 1 blocker and 2 warnings.');
  assert.equal(summarizeJson({ failures: 0, warnings: 0, checks: [] }), 'Doctor found no problems.');
  assert.equal(summarizeJson({ artifacts: [{}, {}], outDir: '/b' }), 'Built 2 artifacts in /b.');
  assert.equal(
    summarizeJson({ managed: 'cli', skipped: [{ reason: 'cli-managed', detail: 'Update the Feather CLI to get latest bundled plugins.' }] }),
    'Update the Feather CLI to get latest bundled plugins.',
  );
  assert.equal(summarizeJson({ include: ['console'], exclude: [], requested: { include: ['console'] } }), 'Included plugins: console.');
  assert.equal(summarizeJson({ something: 'else' }), undefined);
  // Doctor exits 1 on blockers; the notification reports the findings, not "exit code 1".
  assert.equal(
    summarize({ title: 'Feather doctor', status: 'failed', exitCode: 1, steps: [], message: 'Feather CLI failed with exit code 1', json: { failures: 2, warnings: 1, checks: [] } }),
    'Feather doctor: Doctor found 2 blockers and 1 warning.',
  );
  const rendered = renderJsonForOutput({
    projectDir: '/p',
    failures: 1,
    warnings: 0,
    checks: [{ group: 'Packages', label: 'Package lockfile', severity: 'fail', detail: 'bad', fix: 'Fix it' }],
  });
  assert.match(rendered, /Packages\n {2}✖ Package lockfile {2}bad\n {6}→ Fix it/);
});
