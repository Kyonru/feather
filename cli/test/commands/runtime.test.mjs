/* eslint-disable no-undef */
import {
  ANSI_RE,
  LOCAL_SRC,
  assert,
  chmodSync,
  delimiter,
  dirname,
  envWithPath,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  parseDoctorJson,
  parseDoctorJsonResult,
  readFileSync,
  resolve,
  rmSync,
  run,
  sha256,
  spawnCli,
  stopChild,
  symlinkSync,
  test,
  waitForOutput,
  writeBuildConfig,
  writeFakeAdb,
  writeFakeAppleLibrariesZip,
  writeFakeCommand,
  writeFakeLove,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeLoveJs,
  writeFakeVendorGit,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
  writeLocalPluginSource,
  writeLock,
  writeMinimalRuntime,
  readStoredZipEntries,
} from './helpers.mjs';

test('command runtime redacts API keys from compact and debug errors', async () => {
  const { runCliAction } = await import('../../dist/lib/command.js');
  const originalError = console.error;
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  const secret = 'StrongSecretValue1234567890!';
  const lines = [];
  process.env.FEATHER_DEBUG = '1';
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error(`Failed to parse config: apiKey = "${secret}"`);
    });
    const output = lines.join('\n');
    assert.equal(process.exitCode, 1);
    assert.equal(output.includes(secret), false);
    assert.ok(output.includes('apiKey = "[redacted]"'));
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
});

test('command runtime: unexpected errors render compact stderr and exit 1', async () => {
  const { runCliAction } = await import('../../dist/lib/command.js');
  const originalError = console.error;
  const lines = [];
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  delete process.env.FEATHER_DEBUG;
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error('surprise failure');
    });
    assert.equal(process.exitCode, 1);
    assert.ok(lines.join('\n').includes('surprise failure'));
    assert.equal(lines.join('\n').includes('Error: surprise failure'), false);
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
});

test('command runtime: FEATHER_DEBUG includes stack for unexpected errors', async () => {
  const { runCliAction } = await import('../../dist/lib/command.js');
  const originalError = console.error;
  const lines = [];
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  process.env.FEATHER_DEBUG = '1';
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error('debuggable failure');
    });
    assert.equal(process.exitCode, 1);
    assert.ok(lines.join('\n').includes('debuggable failure'));
    assert.ok(lines.join('\n').includes('Error: debuggable failure'));
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
});

test('json commands used by scripts stay parseable and decoration-free', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  const content = 'return {}';
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), content);
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [{ name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
    },
  });

  const audit = run(['package', 'audit', '--json', '--dir', dir]);
  assert.equal(audit.exitCode, 0);
  assert.equal(ANSI_RE.test(audit.stdout), false);
  const auditParsed = JSON.parse(audit.stdout);
  assert.equal(auditParsed[0].status, 'verified');

  const doctor = run(['doctor', dir, '--json']);
  assert.equal(doctor.exitCode, 0);
  assert.equal(ANSI_RE.test(doctor.stdout), false);
  assert.equal(doctor.stdout.trim().startsWith('{'), true);
  JSON.parse(doctor.stdout);
});
