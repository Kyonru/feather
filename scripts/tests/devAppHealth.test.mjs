import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeInspector, probeStudio } from '../dev-app-health.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function websocketTextFrame(text) {
  const payload = Buffer.from(text);
  assert.ok(payload.length < 126, 'fixture uses the short WebSocket frame form');
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

test('Inspector probe recognizes the auth challenge without registering a game session', async () => {
  const server = createTcpServer((socket) => {
    let request = '';
    socket.on('data', (chunk) => {
      request += chunk.toString('utf8');
      if (!request.includes('\r\n\r\n')) return;
      const key = request.match(/^Sec-WebSocket-Key:\s*(.+)$/im)?.[1]?.trim();
      assert.ok(key);
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'));
      socket.write(websocketTextFrame(JSON.stringify({ type: 'auth:challenge', nonce: 'probe-nonce' })));
    });
  });
  const port = await listen(server);
  try {
    assert.deepEqual(await probeInspector(port), { status: 'feather', detail: '' });
  } finally {
    await close(server);
  }
});

test('Inspector probe rejects a foreign listener instead of reusing its port', async () => {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('some other development service');
  });
  const port = await listen(server);
  try {
    const result = await probeInspector(port);
    assert.equal(result.status, 'foreign');
    assert.match(result.detail, /not Inspector/);
  } finally {
    await close(server);
  }
});

test('Studio probe recognizes Studio HTML', async () => {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Feather Studio</title><script type="module" src="/src/main.tsx"></script>');
  });
  const port = await listen(server);
  try {
    assert.deepEqual(await probeStudio(port), { status: 'feather', detail: '' });
  } finally {
    await close(server);
  }
});

test('Studio probe rejects a different Vite application', async () => {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Another App</title><script type="module" src="/src/main.tsx"></script>');
  });
  const port = await listen(server);
  try {
    const result = await probeStudio(port);
    assert.equal(result.status, 'foreign');
    assert.match(result.detail, /not the Feather Studio/);
  } finally {
    await close(server);
  }
});

test('app probes distinguish a free port from a foreign service', async () => {
  const server = createTcpServer();
  const port = await listen(server);
  await close(server);

  assert.equal((await probeInspector(port)).status, 'closed');
  assert.equal((await probeStudio(port)).status, 'closed');
});

test('up names a foreign Inspector listener and exits before launching apps', async () => {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('not Inspector');
  });
  const port = await listen(server);
  try {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, ['scripts/dev-up.mjs', '--no-game'], {
        cwd: root,
        env: { ...process.env, FEATHER_PORT: String(port), NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveResult({ code, signal, stdout, stderr }));
    });

    assert.equal(result.signal, null);
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stdout, new RegExp(`port ${port} is occupied by another service`));
    assert.match(result.stdout, /set FEATHER_PORT to a free port/);
    assert.doesNotMatch(result.stdout, /starting Inspector/);
  } finally {
    await close(server);
  }
});
