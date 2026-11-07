import assert from 'node:assert/strict';
import test from 'node:test';

/** Raw binary channel frames; mirrors encode_binary_frame in ws_server.rs. */

const { decodeBinaryFrame } = await import('../../apps/inspector/src/lib/binary-frame.ts');

function encode(sessionId: string, bytes: number[]): ArrayBuffer {
  const id = new TextEncoder().encode(sessionId);
  const frame = new Uint8Array(2 + id.length + bytes.length);
  new DataView(frame.buffer).setUint16(0, id.length);
  frame.set(id, 2);
  frame.set(bytes, 2 + id.length);
  return frame.buffer;
}

test('a frame decodes to its session and payload, matching the Rust layout', () => {
  // Same bytes the Rust test asserts for ("session-1", [1, 2, 3]).
  const rust = new Uint8Array([0, 9, ...new TextEncoder().encode('session-1'), 1, 2, 3]).buffer;
  const frame = decodeBinaryFrame(rust);
  assert.equal(frame?.sessionId, 'session-1');
  assert.deepEqual([...frame!.bytes], [1, 2, 3]);
  assert.deepEqual(decodeBinaryFrame(encode('s', [9])), decodeBinaryFrame(encode('s', [9])));
});

test('truncated frames are rejected rather than misread', () => {
  assert.equal(decodeBinaryFrame(new Uint8Array([0]).buffer), null);
  assert.equal(decodeBinaryFrame(new Uint8Array([0, 5, 1]).buffer), null);
});

test('an empty payload is a valid frame', () => {
  const frame = decodeBinaryFrame(encode('abc', []));
  assert.equal(frame?.sessionId, 'abc');
  assert.equal(frame?.bytes.length, 0);
});
