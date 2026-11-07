function unionBy<T, K>(a: T[], b: T[], key: (item: T) => K): T[] {
  const map = new Map<K, T>();

  for (const item of [...a, ...b]) {
    map.set(key(item), item);
  }

  return Array.from(map.values());
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Decode base64 to raw binary string
  const binary = atob(base64);
  const len = binary.length;

  // Allocate an ArrayBuffer
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);

  // Fill the buffer with byte values
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export { unionBy, base64ToUint8Array };
