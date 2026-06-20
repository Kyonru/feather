/* eslint-disable no-undef */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assert, outputOf, spawnCli, stopChild, test, waitForOutput } from './helpers.mjs';

const TOKEN = 'test-mcp-token';

function startFakeBridge() {
  const commands = [];
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
      res.end(JSON.stringify({ id: 's1', connected: true, config: { sessionName: 'Test Game' }, logs: [] }));
      return;
    }

    if (req.method === 'POST' && req.url === '/sessions/s1/command') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      commands.push(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, response: null }));
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

    sendRpc(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'feather_list_sessions', arguments: {} },
    });
    const result = await waitForRpc(child, 3);
    assert.match(result.result.content[0].text, /Test Game/);
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
