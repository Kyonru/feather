/** Inspector's independent defense for data authored by a game plugin.
 *
 * The bundled runtime applies the same limits before sending, but Inspector can
 * connect to older, modified, or third-party runtimes. Never hand an unbounded
 * recursive object to the plugin renderer merely because JSON.parse succeeded.
 */
export const PLUGIN_PAYLOAD_LIMITS = {
  maxPayloadBytes: 1024 * 1024,
  maxDepth: 32,
  maxNodes: 5_000,
  maxStringBytes: 256 * 1024,
  maxBinaryAttachments: 256,
} as const;

export type PluginPayloadRejection = {
  ok: false;
  code: 'payload-invalid' | 'payload-too-large';
  message: string;
};

export type PluginPayloadValidation =
  | { ok: true; payloadBytes: number; nodes: number; binaryAttachments: number }
  | PluginPayloadRejection;

const allowedContentTypes = new Set(['gallery', 'table', 'tree', 'timeline', 'ui', 'error']);
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function pathFor(parent: string, key: string | number): string {
  const text = String(key);
  return `${parent}[${text.length > 80 ? `${text.slice(0, 77)}...` : text}]`;
}

function reject(code: PluginPayloadRejection['code'], message: string): PluginPayloadRejection {
  return { ok: false, code, message };
}

export function validatePluginPayload(value: unknown): PluginPayloadValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return reject('payload-invalid', 'Plugin payload must be an object.');
  }

  const contentType = (value as Record<string, unknown>).type;
  if (typeof contentType !== 'string' || !allowedContentTypes.has(contentType)) {
    return reject('payload-invalid', `Plugin payload has unsupported type ${JSON.stringify(contentType)}.`);
  }
  if (contentType === 'ui') {
    const tree = (value as Record<string, unknown>).tree;
    if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
      return reject('payload-invalid', 'Declarative UI payload requires an object tree.');
    }
  }

  const active = new Set<object>();
  let nodes = 0;
  let binaryAttachments = 0;

  const visit = (current: unknown, depth: number, path: string, binaryValue = false): PluginPayloadRejection | null => {
    if (depth > PLUGIN_PAYLOAD_LIMITS.maxDepth) {
      return reject('payload-too-large', `${path} exceeds maximum depth ${PLUGIN_PAYLOAD_LIMITS.maxDepth}.`);
    }
    if (typeof current === 'string') {
      const bytes = byteLength(current);
      if (bytes > PLUGIN_PAYLOAD_LIMITS.maxStringBytes) {
        return reject(
          'payload-too-large',
          `${path} is a ${bytes} byte string (limit ${PLUGIN_PAYLOAD_LIMITS.maxStringBytes}).`,
        );
      }
      return null;
    }
    if (typeof current === 'number' && !Number.isFinite(current)) {
      return reject('payload-invalid', `${path} is not a finite number.`);
    }
    if (current == null || typeof current === 'boolean' || typeof current === 'number') return null;
    if (typeof current !== 'object') return reject('payload-invalid', `${path} contains unsupported ${typeof current}.`);
    if (active.has(current)) return reject('payload-invalid', `${path} contains a cycle.`);

    nodes += 1;
    if (nodes > PLUGIN_PAYLOAD_LIMITS.maxNodes) {
      return reject('payload-too-large', `${path} exceeds maximum node count ${PLUGIN_PAYLOAD_LIMITS.maxNodes}.`);
    }
    if (binaryValue && !Array.isArray(current)) {
      binaryAttachments += 1;
      if (binaryAttachments > PLUGIN_PAYLOAD_LIMITS.maxBinaryAttachments) {
        return reject(
          'payload-too-large',
          `Binary attachment count exceeds ${PLUGIN_PAYLOAD_LIMITS.maxBinaryAttachments}.`,
        );
      }
    }

    active.add(current);
    const entries = Array.isArray(current)
      ? current.map((child, index) => [index, child] as const)
      : Object.entries(current as Record<string, unknown>);
    for (const [key, child] of entries) {
      if (typeof key === 'string') {
        if (blockedKeys.has(key)) {
          active.delete(current);
          return reject('payload-invalid', `${path} contains forbidden key ${key}.`);
        }
        if (byteLength(key) > PLUGIN_PAYLOAD_LIMITS.maxStringBytes) {
          active.delete(current);
          return reject('payload-too-large', `${path} has a key larger than the string limit.`);
        }
      }
      const childBinary = key === 'binary';
      if (childBinary && Array.isArray(child)) {
        binaryAttachments += child.length;
        if (binaryAttachments > PLUGIN_PAYLOAD_LIMITS.maxBinaryAttachments) {
          active.delete(current);
          return reject(
            'payload-too-large',
            `Binary attachment count exceeds ${PLUGIN_PAYLOAD_LIMITS.maxBinaryAttachments}.`,
          );
        }
      }
      const invalid = visit(child, depth + 1, pathFor(path, key), childBinary && !Array.isArray(child));
      if (invalid) {
        active.delete(current);
        return invalid;
      }
    }
    active.delete(current);
    return null;
  };

  const invalid = visit(value, 1, 'data');
  if (invalid) return invalid;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return reject('payload-invalid', `Plugin payload is not serializable: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const payloadBytes = byteLength(serialized);
  if (payloadBytes > PLUGIN_PAYLOAD_LIMITS.maxPayloadBytes) {
    return reject(
      'payload-too-large',
      `Serialized payload is ${payloadBytes} bytes (limit ${PLUGIN_PAYLOAD_LIMITS.maxPayloadBytes}).`,
    );
  }

  return { ok: true, payloadBytes, nodes, binaryAttachments };
}
