/* eslint-disable no-undef */
import {
  assert,
  chmodSync,
  envWithPath,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  readFileSync,
  rmSync,
  run,
  test,
  writeFakeCommand,
  writeFileSync,
} from './helpers.mjs';

function templateFiles() {
  return {
    'game/main.lua': 'local eyes = require("eyes.eyes")\nfunction love.load() eyes.load() end\n',
    'game/main.template.lua': 'function love.load()\n  -- Your game load here\nend\n',
    'game/eyes/sample.txt': 'sample only\n',
    'game/product.env': `LOVE_VERSION="11.5"
PRODUCT_NAME="Template"
PRODUCT_ID="com.ovaltutu.template"
PRODUCT_DESC="A template game made with Love2D"
PRODUCT_COPYRIGHT="Copyright (c) 2025 Oval Tutu"
PRODUCT_COMPANY="Oval Tutu"
PRODUCT_WEBSITE="https://oval-tutu.com"
PRODUCT_UUID="3e64d17c-8797-4382-921f-cf488b22073f"
TARGET_ANDROID="true"
TARGET_HTML="true"
`,
    '.vscode/extensions.json': JSON.stringify(
      {
        recommendations: ['editorconfig.editorconfig', 'JohnnyMorganz.stylua'],
      },
      null,
      2,
    ),
    'Workspace.code-workspace': JSON.stringify(
      {
        folders: [{ name: 'Game', path: './game' }],
        settings: { 'cSpell.words': ['Love2D', 'ovaltutu', 'Template'] },
      },
      null,
      2,
    ),
    '.github/workflows/build.yml': 'name: build\n',
    'tools/tool.txt': 'tool\n',
    'resources/icon.png': 'fake icon\n',
    '.git/HEAD': 'ref: refs/heads/main\n',
  };
}

function writeTemplateProject(projectDir) {
  for (const [relative, content] of Object.entries(templateFiles())) {
    const path = join(projectDir, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
}

function writeFakeCreateGit(dir, options = {}) {
  const recordPath = join(dir, 'git-record.json');
  const files = templateFiles();
  const { binDir } = writeFakeCommand(
    dir,
    'git',
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const recordPath = ${JSON.stringify(recordPath)};
const records = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, 'utf8')) : [];
records.push({ args, cwd: process.cwd() });
fs.writeFileSync(recordPath, JSON.stringify(records, null, 2));
function writeTemplate(target) {
  const files = ${JSON.stringify(files)};
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(target, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}
if (args[0] === 'clone') {
  writeTemplate(args[args.length - 1]);
  process.exit(0);
}
if (args[0] === 'init') {
  fs.mkdirSync(path.join(process.cwd(), '.git'), { recursive: true });
  process.exit(0);
}
if (args[0] === 'add') process.exit(0);
if (args[0] === 'commit') {
  if (${JSON.stringify(options.failCommit ?? false)}) {
    console.error('Author identity unknown');
    console.error('Please tell me who you are.');
    process.exit(128);
  }
  process.exit(0);
}
console.error('unexpected git args ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(join(binDir, 'git'), 0o755);
  return { binDir, recordPath };
}

function records(recordPath) {
  return JSON.parse(readFileSync(recordPath, 'utf8'));
}

test('create helpers resolve latest, main, and explicit refs', async () => {
  const { DEFAULT_CREATE_TEMPLATE, resolveCreateRef, normalizeCreateTemplate } =
    await import('../../dist/commands/create.js');

  const latest = await resolveCreateRef(DEFAULT_CREATE_TEMPLATE, {}, async (repo) => {
    assert.equal(repo, DEFAULT_CREATE_TEMPLATE);
    return '0.1.2';
  });
  assert.deepEqual(latest, { ref: '0.1.2', source: 'latest-release' });

  const main = await resolveCreateRef(DEFAULT_CREATE_TEMPLATE, { main: true }, async () => {
    throw new Error('latest should not be fetched');
  });
  assert.deepEqual(main, { ref: 'main', source: 'main' });

  const explicit = await resolveCreateRef(DEFAULT_CREATE_TEMPLATE, { ref: 'v-test' }, async () => {
    throw new Error('latest should not be fetched');
  });
  assert.deepEqual(explicit, { ref: 'v-test', source: 'explicit' });

  assert.equal(normalizeCreateTemplate('oval-tutu/bootstrap-love2d-project'), DEFAULT_CREATE_TEMPLATE);
});

test('create rejects ref conflicts, unsupported templates, path traversal, and non-empty targets', async () => {
  const { DEFAULT_CREATE_TEMPLATE, normalizeCreateTemplate, resolveCreateRef, resolveCreateTarget } =
    await import('../../dist/commands/create.js');
  const dir = makeTmp();
  const existing = join(dir, 'existing');
  mkdirSync(existing, { recursive: true });
  writeFileSync(join(existing, 'file.txt'), 'x');

  assert.throws(() => normalizeCreateTemplate('someone/else'));
  await assert.rejects(() =>
    resolveCreateRef(DEFAULT_CREATE_TEMPLATE, { main: true, ref: '0.1.2' }, async () => '0.1.2'),
  );
  assert.throws(() => resolveCreateTarget('../escape', dir));
  assert.throws(() => resolveCreateTarget('/tmp/escape', dir));
  assert.throws(() => resolveCreateTarget('existing', dir));
});

test('create --yes clones latest release, cleans Oval-Tutu template, initializes Feather, and commits', () => {
  const workspace = makeTmp();
  const { binDir, recordPath } = writeFakeCreateGit(workspace);

  const result = run(['create', 'awesome', '--yes'], {
    cwd: workspace,
    env: envWithPath(binDir, { FEATHER_TEST_GITHUB_LATEST_RELEASE_TAG: '0.1.2' }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));

  const project = join(workspace, 'awesome');
  assert.equal(existsSync(join(project, 'game', 'main.lua')), true);
  assert.equal(existsSync(join(project, 'game', 'main.template.lua')), false);
  assert.equal(existsSync(join(project, 'game', 'eyes')), false);
  assert.equal(existsSync(join(project, '.github', 'workflows', 'build.yml')), true);
  assert.equal(existsSync(join(project, 'tools', 'tool.txt')), true);
  assert.equal(existsSync(join(project, 'resources', 'icon.png')), true);
  assert.match(readFileSync(join(project, 'game', 'main.lua'), 'utf8'), /Your game load here/);

  const product = readFileSync(join(project, 'game', 'product.env'), 'utf8');
  assert.match(product, /PRODUCT_NAME="Awesome"/);
  assert.match(product, /PRODUCT_ID="com\.feather\.awesome"/);
  assert.match(product, /PRODUCT_UUID="[0-9a-f-]{36}"/i);
  assert.match(product, /TARGET_ANDROID="true"/);

  const workspaceFile = readFileSync(join(project, 'Workspace.code-workspace'), 'utf8');
  assert.ok(workspaceFile.includes('awesome'));
  assert.equal(workspaceFile.includes('ovaltutu'), false);

  const extensions = JSON.parse(readFileSync(join(project, '.vscode', 'extensions.json'), 'utf8'));
  assert.ok(extensions.recommendations.includes('editorconfig.editorconfig'));
  assert.ok(extensions.recommendations.includes('SolenodonteLabs.feather-cli-vscode'));

  const makefile = readFileSync(join(project, 'Makefile'), 'utf8');
  assert.match(makefile, /run:\n\tfeather run game/);
  assert.match(makefile, /doctor:\n\tfeather doctor game/);
  assert.match(makefile, /packages:\n\tfeather package list --installed --dir game/);
  assert.match(makefile, /vendor-list:\n\tfeather build vendor list --dir game/);
  assert.equal(existsSync(join(project, 'game', 'feather.config.lua')), true);

  const gitRecords = records(recordPath);
  const clone = gitRecords.find((record) => record.args[0] === 'clone');
  assert.deepEqual(clone.args.slice(0, 5), [
    'clone',
    '--depth=1',
    '--branch',
    '0.1.2',
    'https://github.com/Oval-Tutu/bootstrap-love2d-project.git',
  ]);
  assert.equal(clone.args.at(-1).endsWith('/awesome'), true);
  assert.ok(gitRecords.some((record) => record.args.join(' ') === 'commit -m feather: init template'));
  assert.ok(gitRecords.some((record) => record.args.join(' ') === 'commit -m feather: configure feather'));
});

test('create --main and --ref choose the requested clone branch', () => {
  const workspace = makeTmp();
  const mainGit = writeFakeCreateGit(join(workspace, 'main-git'));
  mkdirSync(join(workspace, 'main-run'), { recursive: true });
  const mainResult = run(['create', 'main-game', '--main', '--yes'], {
    cwd: join(workspace, 'main-run'),
    env: envWithPath(mainGit.binDir),
  });
  assert.equal(mainResult.exitCode, 0, outputOf(mainResult));
  assert.ok(
    records(mainGit.recordPath).some((record) => record.args.includes('--branch') && record.args.includes('main')),
  );

  const refGit = writeFakeCreateGit(join(workspace, 'ref-git'));
  mkdirSync(join(workspace, 'ref-run'), { recursive: true });
  const refResult = run(['create', 'ref-game', '--ref', 'v-test', '--yes'], {
    cwd: join(workspace, 'ref-run'),
    env: envWithPath(refGit.binDir),
  });
  assert.equal(refResult.exitCode, 0, outputOf(refResult));
  assert.ok(
    records(refGit.recordPath).some((record) => record.args.includes('--branch') && record.args.includes('v-test')),
  );
});

test('create optional flags call plugin, package, and vendor setup paths', async () => {
  const { runCreatePipeline } = await import('../../dist/commands/create.js');
  const workspace = makeTmp();
  const previousCwd = process.cwd();
  const calls = [];

  try {
    process.chdir(workspace);
    await runCreatePipeline(
      'with-flags',
      {
        ref: '0.1.2',
        yes: true,
        plugins: ['console'],
        packages: ['anim8'],
        vendorTargets: ['web'],
      },
      {
        fetchLatestReleaseTag: async () => {
          throw new Error('latest should not be fetched');
        },
        runExternalCommand: async (command, args, options) => {
          calls.push({ command, args, cwd: options?.cwd });
          if (args[0] === 'clone') writeTemplateProject(args[args.length - 1]);
          if (args[0] === 'init') mkdirSync(join(options.cwd, '.git'), { recursive: true });
          return { stdout: '', stderr: '' };
        },
        init: async (dir, opts) => {
          calls.push({ command: 'initCommand', dir, opts });
          writeFileSync(join(dir, 'feather.config.lua'), 'return { managed = "cli" }\n');
        },
        installPlugins: async (ids, opts) => {
          calls.push({ command: 'pluginInstallCommand', ids, opts });
        },
        installPackages: async (names, opts) => {
          calls.push({ command: 'packageInstallCommand', names, opts });
        },
        addVendors: async (targets, opts) => {
          calls.push({ command: 'buildVendorAddCommand', targets, opts });
        },
      },
    );
  } finally {
    process.chdir(previousCwd);
    rmSync(workspace, { recursive: true, force: true });
  }

  const pluginCall = calls.find((call) => call.command === 'pluginInstallCommand');
  assert.deepEqual(pluginCall.ids, ['console']);
  assert.equal(pluginCall.opts.managed, 'cli');
  assert.equal(pluginCall.opts.dir.endsWith(join('with-flags', 'game')), true);

  const packageCall = calls.find((call) => call.command === 'packageInstallCommand');
  assert.deepEqual(packageCall.names, ['anim8']);
  assert.equal(packageCall.opts.dir.endsWith(join('with-flags', 'game')), true);

  const vendorCall = calls.find((call) => call.command === 'buildVendorAddCommand');
  assert.deepEqual(vendorCall.targets, ['web']);
  assert.equal(vendorCall.opts.dir.endsWith(join('with-flags', 'game')), true);
});

test('create keeps project and prints recovery guidance when git identity is missing', () => {
  const workspace = makeTmp();
  const { binDir } = writeFakeCreateGit(workspace, { failCommit: true });

  const result = run(['create', 'identityless', '--ref', '0.1.2', '--yes'], {
    cwd: workspace,
    env: envWithPath(binDir),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(workspace, 'identityless', 'game', 'feather.config.lua')), true);
  assert.ok(outputOf(result).includes('git config user.name "Your Name"'));
  assert.ok(outputOf(result).includes('git config user.email "you@example.com"'));
  assert.ok(outputOf(result).includes('git commit -m'));
});
