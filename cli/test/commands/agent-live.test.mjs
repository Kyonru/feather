/* eslint-disable no-undef */
import { createServer } from 'node:http';
import { assert, outputOf, spawnCli, test } from './helpers.mjs';

const TOKEN = 'test-agent-token';

async function startFakeBridge() {
  const commands = [];
  const logs = [
    { level: 'info', message: 'booted test game' },
    { level: 'warn', message: 'paused at breakpoint' },
  ];
  let sessionReplayList = {
    selectedId: 'replay-1',
    replays: [{
      id: 'replay-1',
      status: 'stopped',
      duration: 1.25,
      inputCount: 2,
      stateCount: 3,
      streamCount: 1,
    }],
  };

  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      writeJson(res, 401, { error: 'invalid token' });
      return;
    }

    if (req.method === 'GET' && req.url === '/sessions') {
      writeJson(res, 200, { sessions: [{ id: 's1', connected: true, name: 'Test Game' }] });
      return;
    }

    if (req.method === 'GET' && req.url === '/sessions/s1') {
      writeJson(res, 200, {
        id: 's1',
        connected: true,
        config: { sessionName: 'Test Game' },
        logs,
        sessionReplay: { recording: false, replaying: false, replayId: 'replay-1' },
        sessionReplayRecording: null,
        sessionReplayList,
        plugins: {
          'session-replay': { enabled: true },
        },
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/sessions/s1/command') {
      const body = await readJson(req);
      commands.push(body);
      if (body.message?.type === 'cmd:session_replay:list') {
        sessionReplayList = {
          selectedId: 'replay-2',
          replays: [{
            id: 'replay-2',
            status: 'stopped',
            duration: 2.5,
            inputCount: 4,
            stateCount: 5,
            streamCount: 1,
          }],
        };
        writeJson(res, 200, { type: 'session_replay:list', data: sessionReplayList });
        return;
      }
    }

    writeJson(res, 404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  return {
    url: `http://127.0.0.1:${address.port}`,
    commands,
    async close() {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await closed;
    },
  };
}

test('agent live cli: session status lists bridge sessions as JSON', async () => {
  const bridge = await startFakeBridge();
  try {
    const result = await runAsync(['session', 'status', '--json', '--desktop-url', bridge.url, '--token', TOKEN]);
    assert.equal(result.exitCode, 0, outputOf(result));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.sessions[0].id, 's1');
    assert.equal(parsed.sessions[0].name, 'Test Game');
  } finally {
    await bridge.close();
  }
});

test('agent live cli: logs export reads the only connected session', async () => {
  const bridge = await startFakeBridge();
  try {
    const result = await runAsync(['logs', 'export', '--json', '--desktop-url', bridge.url, '--token', TOKEN]);
    assert.equal(result.exitCode, 0, outputOf(result));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.sessionId, 's1');
    assert.equal(parsed.count, 2);
    assert.equal(parsed.logs[1].message, 'paused at breakpoint');
  } finally {
    await bridge.close();
  }
});

test('agent live cli: replay list can refresh before reporting replays', async () => {
  const bridge = await startFakeBridge();
  try {
    const result = await runAsync(['replay', 'list', '--refresh', '--json', '--desktop-url', bridge.url, '--token', TOKEN]);
    assert.equal(result.exitCode, 0, outputOf(result));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.sessionId, 's1');
    assert.equal(parsed.refreshed, true);
    assert.equal(parsed.selectedId, 'replay-2');
    assert.equal(parsed.replayCount, 1);
    assert.equal(parsed.replays[0].id, 'replay-2');
    assert.equal(bridge.commands[0].message.type, 'cmd:session_replay:list');
  } finally {
    await bridge.close();
  }
});

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
  res.end(JSON.stringify(body));
}

function runAsync(args, timeoutMs = 5000) {
  const child = spawnCli(args);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI command timed out: ${args.join(' ')}\n${stdout}\n${stderr}`));
    }, timeoutMs);

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
