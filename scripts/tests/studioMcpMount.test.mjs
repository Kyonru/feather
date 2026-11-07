import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const studioAppUrl = new URL('../../apps/studio/src/StudioApp.tsx', import.meta.url);

test('Studio mounts the creative MCP bridge in its always-present application root', async () => {
  const source = await readFile(studioAppUrl, 'utf8');

  assert.match(source, /import \{ useMcpCreativeBridge \} from ['"]\.\/hooks\/use-mcp-creative-bridge['"]/);
  assert.match(
    source,
    /export function StudioApp\(\) \{\s*useMcpCreativeBridge\(\);/,
    'the bridge must be mounted before any tool-specific rendering so every creative endpoint is available',
  );
});
