import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { createConnection } from 'node:net';

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_HTTP_BYTES = 64 * 1024;

function closed(error) {
  return error?.code === 'ECONNREFUSED' || error?.code === 'EHOSTUNREACH' || error?.code === 'ENETUNREACH';
}

/**
 * Identify Inspector by the first message in its game WebSocket protocol.
 * Merely accepting TCP is not enough: another dev server may legitimately own
 * 4004, and launching a game against it produces a very confusing no-session
 * failure. Inspector always begins with an auth:challenge before registering a
 * session, so this probe has no visible side effect in the app.
 */
export function probeInspector(port, options = {}) {
  const host = options.host ?? '127.0.0.1';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    let buffer = Buffer.alloc(0);
    let headersRead = false;
    let settled = false;

    const settle = (status, detail = '') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ status, detail });
    };

    socket.setTimeout(timeoutMs, () => settle('foreign', 'it did not answer the Inspector WebSocket handshake'));
    socket.once('error', (error) => {
      settle(closed(error) ? 'closed' : 'foreign', error instanceof Error ? error.message : String(error));
    });
    socket.once('connect', () => {
      const key = randomBytes(16).toString('base64');
      socket.write([
        'GET / HTTP/1.1',
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_HTTP_BYTES) {
        settle('foreign', 'its handshake response was unexpectedly large');
        return;
      }

      if (!headersRead) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const headers = buffer.subarray(0, end).toString('utf8');
        buffer = buffer.subarray(end + 4);
        headersRead = true;
        if (!/^HTTP\/1\.1 101\b/m.test(headers) || !/^upgrade:\s*websocket\s*$/im.test(headers)) {
          settle('foreign', 'it is not Inspector\'s WebSocket server');
          return;
        }
      }

      // Inspector's challenge is a small, unmasked text frame. Support the two
      // standard payload-length encodings so this remains a protocol probe, not
      // a dependency on the current nonce size.
      if (buffer.length < 2) return;
      const opcode = buffer[0] & 0x0f;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        settle('foreign', 'its first WebSocket message was unexpectedly large');
        return;
      }
      if (buffer.length < offset + length) return;
      if (opcode !== 1 || (buffer[1] & 0x80) !== 0) {
        settle('foreign', 'it did not send Inspector\'s text authentication challenge');
        return;
      }

      try {
        const message = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8'));
        if (message?.type === 'auth:challenge' && typeof message.nonce === 'string' && message.nonce.length > 0) {
          settle('feather');
        } else {
          settle('foreign', 'its WebSocket protocol is not Feather Inspector');
        }
      } catch {
        settle('foreign', 'its first WebSocket message is not Inspector JSON');
      }
    });
  });
}

/** Identify Studio's Vite server by its application HTML, not just port 1430. */
export function probeStudio(port, options = {}) {
  const host = options.host ?? '127.0.0.1';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (status, detail = '') => {
      if (settled) return;
      settled = true;
      resolve({ status, detail });
    };

    const request = httpGet({ host, port, path: '/', timeout: timeoutMs }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_HTTP_BYTES) {
          request.destroy();
          settle('foreign', 'its HTML response was unexpectedly large');
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        const isStudio = response.statusCode === 200
          && /<title>\s*Feather Studio\s*<\/title>/i.test(html)
          && /<script[^>]+src=["']\/src\/main\.tsx["']/i.test(html);
        settle(isStudio ? 'feather' : 'foreign', isStudio ? '' : 'it is not the Feather Studio dev server');
      });
    });
    request.once('timeout', () => {
      request.destroy();
      settle('foreign', 'it did not answer the Studio identity request');
    });
    request.once('error', (error) => {
      settle(closed(error) ? 'closed' : 'foreign', error instanceof Error ? error.message : String(error));
    });
  });
}
