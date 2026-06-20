/* eslint-disable no-undef */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assert, outputOf, spawnCli, stopChild, test, waitForOutput } from './helpers.mjs';

const TOKEN = 'test-mcp-token';

function startFakeBridge() {
  const commands = [];
  const creativeActions = [];
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
        logs: [],
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
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
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
  } finally {
    await stopChild(child);
    await bridge.close();
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
