/**
 * Asset helpers Studio actually uses.
 *
 * This file arrived as a copy of Inspector's. Its `createGif` had no caller
 * here — Inspector keeps its own — and it pointed at `/gif.worker.js`, which
 * Studio does not serve, so the one thing it could have done was fail. Removed
 * rather than left as a trap for whoever calls it next.
 */
export async function fetchBlobAsUint8Array(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
