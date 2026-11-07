import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLUGIN_PAYLOAD_LIMITS,
  validatePluginPayload,
} from '../../apps/inspector/src/lib/plugin-payload.ts';

function rejectionMessage(value: unknown): string {
  const result = validatePluginPayload(value);
  assert.equal(result.ok, false);
  return result.ok ? '' : result.message;
}

test('accepts a bounded declarative plugin UI payload', () => {
  const result = validatePluginPayload({
    type: 'ui',
    tree: {
      type: 'panel',
      title: 'Runtime state',
      children: [{ type: 'text', value: 'healthy' }],
    },
    loading: false,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.payloadBytes > 0);
    assert.equal(result.nodes, 4);
  }
});

test('rejects invalid roots and declarative UI without a tree', () => {
  assert.deepEqual(validatePluginPayload([]), {
    ok: false,
    code: 'payload-invalid',
    message: 'Plugin payload must be an object.',
  });
  assert.match(rejectionMessage({ type: 'ui' }), /requires an object tree/);
  assert.match(rejectionMessage({ type: 'unknown' }), /unsupported type/);
});

test('bounds plugin depth, nodes, strings, bytes and binary references', () => {
  let deep: Record<string, unknown> = { type: 'ui', tree: { type: 'text' } };
  let cursor = deep;
  for (let index = 0; index < PLUGIN_PAYLOAD_LIMITS.maxDepth + 1; index += 1) {
    const child: Record<string, unknown> = {};
    cursor.child = child;
    cursor = child;
  }
  assert.match(rejectionMessage(deep), /maximum depth/);

  const children = Array.from({ length: PLUGIN_PAYLOAD_LIMITS.maxNodes + 1 }, () => ({}));
  assert.match(rejectionMessage({ type: 'table', children }), /maximum node count/);

  const longString = 'x'.repeat(PLUGIN_PAYLOAD_LIMITS.maxStringBytes + 1);
  assert.match(rejectionMessage({ type: 'table', value: longString }), /byte string/);

  const binary = Array.from({ length: PLUGIN_PAYLOAD_LIMITS.maxBinaryAttachments + 1 }, (_, index) => ({
    id: `binary-${index}`,
    mime: 'application/octet-stream',
  }));
  assert.match(rejectionMessage({ type: 'gallery', binary }), /Binary attachment count/);

  const nearLimitStrings = Array.from({ length: 5 }, () => 'x'.repeat(PLUGIN_PAYLOAD_LIMITS.maxStringBytes - 10));
  assert.match(rejectionMessage({ type: 'table', data: nearLimitStrings }), /Serialized payload/);
});

test('rejects cycles, non-finite values and prototype keys', () => {
  const cycle: Record<string, unknown> = { type: 'table' };
  cycle.self = cycle;
  assert.match(rejectionMessage(cycle), /cycle/);
  assert.match(rejectionMessage({ type: 'table', value: Number.POSITIVE_INFINITY }), /finite number/);

  const dangerous = JSON.parse('{"type":"table","__proto__":{"polluted":true}}');
  assert.match(rejectionMessage(dangerous), /forbidden key/);
});
