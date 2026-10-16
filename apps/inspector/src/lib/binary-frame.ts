/**
 * Binary frames on the raw Tauri channel: `[u16 BE session id length]`
 * `[session id UTF-8][payload]`. Mirrors `encode_binary_frame` in
 * `apps/inspector/src-tauri/src/ws_server.rs`.
 */
export function decodeBinaryFrame(buffer: ArrayBuffer): { sessionId: string; bytes: Uint8Array<ArrayBuffer> } | null {
  if (buffer.byteLength < 2) return null;
  const idLength = new DataView(buffer).getUint16(0);
  if (buffer.byteLength < 2 + idLength) return null;
  const sessionId = new TextDecoder().decode(new Uint8Array(buffer, 2, idLength));
  return { sessionId, bytes: new Uint8Array(buffer, 2 + idLength) };
}
