/* eslint-disable no-undef */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, envWithPath, existsSync, outputOf, readFileSync, run, spawnCli, stopChild, test, waitForOutput, writeFakeCommand } from './helpers.mjs';

const TOKEN = 'test-mcp-token';

function startFakeBridge() {
  const commands = [];
  const creativeActions = [];
  const sourceRoot = mkdtempSync(join(tmpdir(), 'feather-mcp-debugger-'));
  writeFileSync(
    join(sourceRoot, 'main.lua'),
    [
      'function love.update(dt)',
      '  local x = 1',
      '  x = x + dt',
      '  print(x)',
      'end',
      '',
    ].join('\n'),
  );
  const logs = [
    { level: 'info', message: 'booted test game' },
    { level: 'warn', message: 'paused at breakpoint' },
  ];
  const debuggerStatus = {
    enabled: true,
    paused: true,
    sourceRoot,
    breakpointCount: 1,
    breakpoints: [{ file: 'main.lua', line: 3 }],
  };
  let debuggerPaused = {
    file: 'main.lua',
    line: 3,
    reason: 'breakpoint',
    pauseId: 1,
    stack: [{ index: 0, file: 'main.lua', line: 3, name: 'love.update', what: 'Lua' }],
    locals: { dt: '0.016', x: '1' },
    upvalues: {},
  };
  let sessionReplayStatus = {
    recording: false,
    replaying: false,
    replayId: 'replay-1',
    duration: 1.25,
    inputCount: 2,
    stateCount: 3,
    initialStateCount: 1,
    checkpointCount: 1,
    streamCount: 1,
    missingRestorers: [],
  };
  let sessionReplayRecording = null;
  let sessionReplayList = {
    selectedId: 'replay-1',
    replays: [{
      id: 'replay-1',
      status: 'stopped',
      duration: 1.25,
      inputCount: 2,
      stateCount: 3,
      initialStateCount: 1,
      checkpointCount: 1,
      streamCount: 1,
    }],
  };
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid token' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/sessions') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ sessions: [{ id: 's1', connected: true, name: 'Test Game' }] }));
      return;
    }

    if (req.method === 'GET' && req.url === '/sessions/s1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 's1',
        connected: true,
        config: { sessionName: 'Test Game' },
        logs,
        debuggerStatus,
        debuggerPaused,
        sessionReplay: sessionReplayStatus,
        sessionReplayRecording,
        sessionReplayList,
        plugins: {
          'particle-system-playground': {
            type: 'particle-system-playground',
            activeComposite: 'Spark',
          },
          'shader-graph': {
            type: 'shader-graph',
            preview: { active: true },
          },
        },
      }));
      return;
    }

    if (req.method === 'GET' && req.url === '/creative/shader-graph') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'shader-graph', shaderName: 'Test Shader' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/creative/texture-lab') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'texture-lab', recipe: { generator: 'soft-circle' } }));
      return;
    }

    if (req.method === 'GET' && req.url === '/creative/particle-system-playground') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'particle-system-playground', sessionId: 's1' }));
      return;
    }

    const creativeMatch = req.url?.match(/^\/creative\/([^/]+)\/action$/);
    if (req.method === 'POST' && creativeMatch) {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const tool = decodeURIComponent(creativeMatch[1]);
      creativeActions.push({ tool, body });
      const responseByAction = {
        generators: { generators: [{ id: 'soft-circle', label: 'Soft Circle' }] },
        snapshot: { type: tool },
        create: {
          mode: 'source',
          shaderName: body.params?.shaderName ?? 'MCP Shader',
          glsl: { pixel: body.params?.pixelSource ?? 'vec4 effect(){return vec4(1.0);}', vertex: null, hash: 'test' },
        },
        compile: { glsl: { pixel: 'vec4 effect(){return vec4(1.0);}', vertex: '' }, diagnostics: [] },
        'preview-params': { pixelSource: 'vec4 effect(){return vec4(1.0);}', vertexSource: '', shape: 'circle', color: [1, 1, 1, 1] },
        export: { filename: 'test.feathershgh', content: '{}' },
        generate: { filename: 'soft-circle.png', width: 32, height: 32, dataBase64: 'abc', recipe: { generator: 'soft-circle' } },
        'generate-atlas': { texture: { filename: 'atlas.png', width: 64, height: 64, dataBase64: 'abc' }, frames: [], atlas: { frameCount: 1 } },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, response: responseByAction[body.action] ?? { ok: true } }));
      return;
    }

    if (req.method === 'POST' && req.url === '/sessions/s1/command') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      commands.push(body);
      const message = body.message ?? {};
      let response = null;
      if (message.type === 'cmd:plugin:action' && message.plugin === 'particle-system-playground') {
        response = {
          type: 'plugin:action:response',
          plugin: 'particle-system-playground',
          action: message.action,
          data: message.action === 'new-composite'
            ? { composite: message.params?.name ?? 'Scratch Composite' }
            : { ok: true },
        };
      }
      if (message.type === 'cmd:debugger:enable') {
        debuggerStatus.enabled = true;
        response = { type: 'debugger:status', data: debuggerStatus };
      }
      if (message.type === 'cmd:debugger:set_breakpoints') {
        debuggerStatus.breakpoints = message.data?.breakpoints ?? [];
        debuggerStatus.breakpointCount = debuggerStatus.breakpoints.length;
        response = { type: 'debugger:status', data: debuggerStatus };
      }
      if (message.type === 'cmd:debugger:step_over' || message.type === 'cmd:debugger:step_into' || message.type === 'cmd:debugger:step_out') {
        debuggerPaused = { ...debuggerPaused, line: 4, reason: 'step', pauseId: 2 };
        debuggerStatus.paused = true;
        response = { type: 'debugger:paused', data: debuggerPaused };
      }
      if (message.type === 'cmd:debugger:continue') {
        debuggerPaused = null;
        debuggerStatus.paused = false;
        response = { type: 'debugger:resumed', data: { reason: 'continue' } };
      }
      if (message.type === 'cmd:debugger:inspect_frame') {
        response = {
          type: 'debugger:frame',
          data: {
            pauseId: 1,
            index: message.data?.index ?? 0,
            file: 'main.lua',
            line: 3,
            locals: { dt: '0.016', inspected: 'true' },
            upvalues: {},
          },
        };
      }
      if (message.type?.startsWith('cmd:session_replay:')) {
        const action = message.type.replace('cmd:session_replay:', '');
        if (action === 'start') {
          sessionReplayStatus = {
            ...sessionReplayStatus,
            recording: true,
            replaying: false,
            replayId: message.data?.id ?? 'mcp-replay',
            duration: 0,
            inputCount: 0,
            stateCount: 0,
          };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'stop') {
          sessionReplayStatus = { ...sessionReplayStatus, recording: false, duration: 2.5 };
          sessionReplayList = {
            selectedId: sessionReplayStatus.replayId,
            replays: [{ id: sessionReplayStatus.replayId, status: 'stopped', duration: 2.5, inputCount: 1, stateCount: 1, streamCount: 1 }],
          };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'request') {
          const id = message.data?.id ?? sessionReplayStatus.replayId ?? 'replay-1';
          sessionReplayRecording = {
            manifest: { id, duration: 2.5 },
            files: [
              { path: 'manifest.json', content: JSON.stringify({ id, duration: 2.5 }) },
              { path: 'inputs.jsonl', content: '' },
            ],
          };
          response = { type: 'session_replay:recording', data: sessionReplayRecording };
        } else if (action === 'list') {
          response = { type: 'session_replay:list', data: sessionReplayList };
        } else if (action === 'play') {
          sessionReplayStatus = {
            ...sessionReplayStatus,
            recording: false,
            replaying: true,
            replayId: message.data?.id ?? sessionReplayStatus.replayId,
          };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'seek') {
          sessionReplayStatus = {
            ...sessionReplayStatus,
            replaying: message.data?.play === true,
            seekTarget: message.data?.target ?? message.data?.seekTo,
          };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'stop_replay') {
          sessionReplayStatus = { ...sessionReplayStatus, replaying: false };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'import') {
          const manifest = JSON.parse(message.data?.files?.[0]?.content ?? '{"id":"imported-replay"}');
          sessionReplayList = {
            selectedId: manifest.id,
            replays: [{ id: manifest.id, status: 'imported', duration: 0, inputCount: 0, stateCount: 0, streamCount: 0 }],
          };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        } else if (action === 'delete') {
          sessionReplayList = { selectedId: null, replays: [] };
          response = { type: 'session_replay:status', data: sessionReplayStatus };
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, response }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        commands,
        creativeActions,
        sourceRoot,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
          .finally(() => rmSync(sourceRoot, { recursive: true, force: true })),
      });
    });
  });
}

function sendRpc(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitForRpc(child, id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for RPC ${id}. Buffer:\n${buffer}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          cleanup();
          reject(new Error(`Non-JSON stdout line: ${line}\n${error}`));
          return;
        }
        if (parsed.id === id) {
          cleanup();
          resolve(parsed);
          return;
        }
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`MCP process exited with ${code}. Buffer:\n${buffer}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function writeSharedMcpConfig(home, values = {}) {
  const featherDir = join(home, '.feather');
  mkdirSync(featherDir, { recursive: true });
  writeFileSync(
    join(featherDir, 'mcp.json'),
    JSON.stringify({
      enabled: true,
      token: TOKEN,
      bridgeUrl: 'http://127.0.0.1:4005',
      ...values,
    }, null, 2),
  );
}

function runOk(args, extra = {}) {
  const result = run(args, extra);
  assert.equal(result.exitCode, 0, outputOf(result));
  return result;
}

function parseJsonResult(result) {
  assert.equal(result.stderr, '', outputOf(result));
  return JSON.parse(result.stdout);
}

test('mcp setup configures Codex without copying the MCP token', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const codexConfig = join(home, '.codex', 'config.toml');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'codex', '--codex-config', codexConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(payload.client, 'codex');
  assert.equal(payload.action, 'create');
  assert.equal(payload.changed, true);
  assert.equal(payload.sharedConfig.hasToken, true);
  assert.equal(payload.restartRequired, true);

  const content = readFileSync(codexConfig, 'utf8');
  assert.match(content, /\[mcp_servers\.feather\]/);
  assert.match(content, /command = "feather"/);
  assert.match(content, /args = \["mcp"\]/);
  assert.doesNotMatch(content, /FEATHER_MCP_TOKEN|test-mcp-token/);

  const second = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'codex', '--codex-config', codexConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(second.action, 'unchanged');
  assert.equal(second.changed, false);
});

test('mcp setup dry-run leaves Codex config untouched', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const codexConfig = join(home, '.codex', 'config.toml');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'codex', '--codex-config', codexConfig, '--command', 'feather', '--dry-run', '--json'], { env }),
  );

  assert.equal(payload.dryRun, true);
  assert.equal(payload.changed, true);
  assert.equal(payload.action, 'create');
  assert.equal(existsSync(codexConfig), false);
});

test('mcp setup falls back to this CLI when global feather lacks mcp', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const toolDir = mkdtempSync(join(tmpdir(), 'feather-old-cli-'));
  const { binDir } = writeFakeCommand(toolDir, 'feather', `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('3.3.1');
  process.exit(0);
}
if (args[0] === 'mcp' && args[1] === '--help') {
  console.log('Usage: feather [options] [command]');
  console.log('Commands:');
  console.log('  run [options] [game-path]');
  process.exit(0);
}
console.error("error: unknown command '" + args[0] + "'");
process.exit(1);
`);
  const env = envWithPath(binDir, { HOME: home });
  writeSharedMcpConfig(home);
  const codexConfig = join(home, '.codex', 'config.toml');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'codex', '--codex-config', codexConfig, '--json'], { env }),
  );

  assert.notEqual(payload.server.command, 'feather');
  assert.equal(payload.server.args.at(-1), 'mcp');
  const content = readFileSync(codexConfig, 'utf8');
  assert.doesNotMatch(content, /command = "feather"/);
  assert.match(content, /args = \[.*"mcp"\]/);
});

test('mcp setup replaces an existing Feather MCP block and preserves other servers', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const codexConfig = join(home, '.codex', 'config.toml');
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(
    codexConfig,
    [
      '[projects."/tmp/game"]',
      'trust_level = "trusted"',
      '',
      '[mcp_servers.expo]',
      'url = "https://mcp.expo.dev/mcp"',
      '',
      '[mcp_servers.feather]',
      'command = "old-feather"',
      'args = ["mcp", "--token", "test-mcp-token"]',
      '',
      '[mcp_servers.feather.env]',
      'FEATHER_MCP_TOKEN = "test-mcp-token"',
      '',
      '[mcp_servers.other]',
      'command = "other"',
      'args = []',
      '',
    ].join('\n'),
  );

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'codex', '--codex-config', codexConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(payload.action, 'update');

  const content = readFileSync(codexConfig, 'utf8');
  assert.match(content, /\[projects\."\/tmp\/game"\]/);
  assert.match(content, /\[mcp_servers\.expo\]/);
  assert.match(content, /\[mcp_servers\.other\]/);
  assert.match(content, /\[mcp_servers\.feather\]/);
  assert.match(content, /command = "feather"/);
  assert.doesNotMatch(content, /old-feather|FEATHER_MCP_TOKEN|test-mcp-token/);
});

test('mcp setup configures Claude user config without copying the MCP token', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const claudeConfig = join(home, '.claude.json');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'claude', '--claude-config', claudeConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(payload.client, 'claude');
  assert.equal(payload.configKind, 'claude-json');
  assert.equal(payload.scope, 'user');
  assert.equal(payload.action, 'create');
  assert.equal(payload.changed, true);
  assert.equal(payload.restartRequired, true);

  const content = readFileSync(claudeConfig, 'utf8');
  const config = JSON.parse(content);
  assert.deepEqual(config.mcpServers.feather, {
    type: 'stdio',
    command: 'feather',
    args: ['mcp'],
  });
  assert.doesNotMatch(content, /FEATHER_MCP_TOKEN|test-mcp-token/);

  const second = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'claude', '--claude-config', claudeConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(second.action, 'unchanged');
  assert.equal(second.changed, false);
});

test('mcp setup configures Claude project .mcp.json', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'feather-mcp-project-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const projectConfig = join(projectDir, '.mcp.json');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'claude', '--scope', 'project', '--command', 'feather', '--json'], {
      cwd: projectDir,
      env,
    }),
  );

  assert.equal(payload.client, 'claude');
  assert.equal(payload.scope, 'project');
  assert.equal(payload.configPath.endsWith('/.mcp.json'), true);
  assert.equal(payload.action, 'create');
  assert.equal(existsSync(projectConfig), true);

  const config = JSON.parse(readFileSync(payload.configPath, 'utf8'));
  assert.deepEqual(config.mcpServers.feather, {
    type: 'stdio',
    command: 'feather',
    args: ['mcp'],
  });
});

test('mcp setup configures Claude local project scope', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'feather-mcp-project-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const claudeConfig = join(home, '.claude.json');

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'claude', '--scope', 'local', '--command', 'feather', '--json'], {
      cwd: projectDir,
      env,
    }),
  );

  assert.equal(payload.client, 'claude');
  assert.equal(payload.scope, 'local');
  assert.equal(payload.configPath, claudeConfig);
  assert.ok(payload.projectPath);

  const config = JSON.parse(readFileSync(claudeConfig, 'utf8'));
  assert.deepEqual(config.projects[payload.projectPath].mcpServers.feather, {
    type: 'stdio',
    command: 'feather',
    args: ['mcp'],
  });
});

test('mcp setup replaces an existing Claude Feather server and preserves other servers', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };
  writeSharedMcpConfig(home);
  const claudeConfig = join(home, '.claude.json');
  writeFileSync(
    claudeConfig,
    JSON.stringify({
      theme: 'dark',
      mcpServers: {
        expo: {
          type: 'http',
          url: 'https://mcp.expo.dev/mcp',
        },
        feather: {
          type: 'stdio',
          command: 'old-feather',
          args: ['mcp', '--token', 'test-mcp-token'],
          env: {
            FEATHER_MCP_TOKEN: 'test-mcp-token',
          },
        },
      },
    }, null, 2),
  );

  const payload = parseJsonResult(
    runOk(['mcp', 'setup', '--client', 'claude', '--claude-config', claudeConfig, '--command', 'feather', '--json'], { env }),
  );
  assert.equal(payload.action, 'update');

  const content = readFileSync(claudeConfig, 'utf8');
  const config = JSON.parse(content);
  assert.equal(config.theme, 'dark');
  assert.deepEqual(config.mcpServers.expo, {
    type: 'http',
    url: 'https://mcp.expo.dev/mcp',
  });
  assert.deepEqual(config.mcpServers.feather, {
    type: 'stdio',
    command: 'feather',
    args: ['mcp'],
  });
  assert.doesNotMatch(content, /old-feather|FEATHER_MCP_TOKEN|test-mcp-token/);
});

test('mcp setup rejects unsupported clients', () => {
  const home = mkdtempSync(join(tmpdir(), 'feather-mcp-setup-'));
  const result = run(['mcp', 'setup', '--client', 'cursor'], {
    env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Unsupported MCP setup client/);
  assert.match(result.stderr, /--client codex or --client claude/);
});

test('mcp: stdio initializes, lists tools, and calls the fake bridge without stdout logs', async () => {
  const bridge = await startFakeBridge();
  const child = spawnCli(['mcp', '--transport', 'stdio', '--desktop-url', bridge.url], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', FEATHER_MCP_TOKEN: TOKEN },
  });

  try {
    sendRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'feather-test', version: '1.0.0' },
      },
    });
    const init = await waitForRpc(child, 1);
    assert.equal(init.result.serverInfo.name, 'feather');

    sendRpc(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
    sendRpc(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = await waitForRpc(child, 2);
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_list_sessions'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_list_plugins'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_create_shader'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_create_particle_system'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_create_texture'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_debugger_state'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_debugger_set_breakpoints'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_debugger_step'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_debugger_continue'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_debugger_line_context'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_session_replay_state'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_session_replay_start'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_session_replay_load'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_session_replay_play'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_session_replay_seek'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_shader_graph_compile'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_particles_export_zip'));
    assert.ok(tools.result.tools.some((tool) => tool.name === 'feather_texture_lab_generate'));

    sendRpc(child, { jsonrpc: '2.0', id: 4, method: 'resources/list' });
    const resources = await waitForRpc(child, 4);
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://plugins/catalog'));
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://creative/texture-lab'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'feather_list_sessions', arguments: {} },
    });
    const result = await waitForRpc(child, 3);
    assert.match(result.result.content[0].text, /Test Game/);

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'feather_texture_lab_generate', arguments: { recipe: { generator: 'soft-circle' } } },
    });
    const texture = await waitForRpc(child, 5);
    assert.match(texture.result.content[0].text, /soft-circle\.png/);
    assert.equal(bridge.creativeActions.at(-1).tool, 'texture-lab');

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'feather_create_shader',
        arguments: {
          shaderName: 'MCP Shader',
          pixelSource: 'vec4 effect(vec4 color, Image tex, vec2 uv, vec2 screen){ return vec4(1.0); }',
          previewInGame: true,
          previewShape: 'rectangle',
        },
      },
    });
    const shader = await waitForRpc(child, 6);
    assert.match(shader.result.content[0].text, /MCP Shader/);
    assert.equal(bridge.creativeActions.at(-1).tool, 'shader-graph');
    assert.equal(bridge.creativeActions.at(-1).body.action, 'create');
    assert.ok(bridge.commands.some((command) => command.message?.plugin === 'shader-graph' && command.message?.action === 'preview-shader'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'feather_create_texture',
        arguments: { generator: 'soft-circle', width: 32, height: 32 },
      },
    });
    const createdTexture = await waitForRpc(child, 7);
    assert.match(createdTexture.result.content[0].text, /soft-circle\.png/);
    assert.equal(bridge.creativeActions.at(-1).body.action, 'generate');

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'feather_create_particle_system',
        arguments: {
          name: 'MCP Spark',
          params: { emissionRate: 40, emitAtStart: 80 },
          exportCode: true,
        },
      },
    });
    const particle = await waitForRpc(child, 8);
    assert.match(particle.result.content[0].text, /MCP Spark/);
    assert.ok(bridge.commands.some((command) => command.message?.action === 'new-composite'));
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:plugin:params'));
    assert.ok(bridge.commands.some((command) => command.message?.action === 'export-code'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'feather_debugger_state', arguments: { contextLines: 1 } },
    });
    const debuggerState = await waitForRpc(child, 9);
    assert.match(debuggerState.result.content[0].text, /paused at breakpoint/);
    assert.match(debuggerState.result.content[0].text, /x = x \+ dt/);

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'feather_debugger_set_breakpoints',
        arguments: { breakpoints: [{ file: 'main.lua', line: 4 }] },
      },
    });
    const breakpointResult = await waitForRpc(child, 10);
    assert.match(breakpointResult.result.content[0].text, /"line": 4/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:debugger:set_breakpoints'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'feather_debugger_step', arguments: { action: 'over', contextLines: 0 } },
    });
    const stepResult = await waitForRpc(child, 11);
    assert.match(stepResult.result.content[0].text, /"reason": "step"/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:debugger:step_over'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'feather_debugger_continue', arguments: {} },
    });
    const continueResult = await waitForRpc(child, 12);
    assert.match(continueResult.result.content[0].text, /debugger:resumed/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:debugger:continue'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: 'feather_session_replay_state', arguments: {} },
    });
    const replayState = await waitForRpc(child, 13);
    assert.match(replayState.result.content[0].text, /replay-1/);

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: { name: 'feather_session_replay_start', arguments: { id: 'mcp-run' } },
    });
    const replayStart = await waitForRpc(child, 14);
    assert.match(replayStart.result.content[0].text, /"recording": true/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:session_replay:start'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: { name: 'feather_session_replay_stop', arguments: {} },
    });
    const replayStop = await waitForRpc(child, 15);
    assert.match(replayStop.result.content[0].text, /"recording": false/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:session_replay:stop'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: { name: 'feather_session_replay_load', arguments: { id: 'mcp-run' } },
    });
    const replayLoad = await waitForRpc(child, 16);
    assert.match(replayLoad.result.content[0].text, /manifest\.json/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:session_replay:request'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: { name: 'feather_session_replay_play', arguments: { id: 'mcp-run', seekTo: 0 } },
    });
    const replayPlay = await waitForRpc(child, 17);
    assert.match(replayPlay.result.content[0].text, /"replaying": true/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:session_replay:play'));

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: { name: 'feather_session_replay_seek', arguments: { target: '0', play: false } },
    });
    const replaySeek = await waitForRpc(child, 18);
    assert.match(replaySeek.result.content[0].text, /"seekTarget": "0"/);
    assert.ok(bridge.commands.some((command) => command.message?.type === 'cmd:session_replay:seek'));
  } finally {
    await stopChild(child);
    await bridge.close();
  }
});

test('mcp: resources/list keeps static resources discoverable when bridge is unavailable', async () => {
  const port = await freePort();
  const child = spawnCli(['mcp', '--transport', 'stdio', '--desktop-url', `http://127.0.0.1:${port}`], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', FEATHER_MCP_TOKEN: TOKEN },
  });

  try {
    sendRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'feather-test', version: '1.0.0' },
      },
    });
    await waitForRpc(child, 1);

    sendRpc(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
    sendRpc(child, { jsonrpc: '2.0', id: 2, method: 'resources/list' });
    const resources = await waitForRpc(child, 2);

    assert.ifError(resources.error);
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://sessions'));
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://plugins/catalog'));
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://creative/shader-graph'));
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'feather://creative/texture-lab'));
  } finally {
    await stopChild(child);
  }
});

test('mcp: HTTP transport requires bearer auth and accepts an authorized initialize', async () => {
  const bridge = await startFakeBridge();
  const port = await freePort();
  const child = spawnCli(
    ['mcp', '--transport', 'http', '--port', String(port), '--desktop-url', bridge.url, '--token', TOKEN],
    { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } },
  );

  try {
    await waitForOutput(child, /MCP HTTP server listening/);

    const rejected = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'feather-test', version: '1.0.0' },
        },
      }),
    });
    assert.notEqual(accepted.status, 401, outputOf({ stdout: await accepted.text(), stderr: '', exitCode: accepted.status }));
  } finally {
    await stopChild(child);
    await bridge.close();
  }
});
