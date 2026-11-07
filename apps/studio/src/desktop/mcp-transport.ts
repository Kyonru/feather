import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CreativeMcpRequest, CreativeMcpTransport } from '../mcp/transport.ts';

/**
 * Studio's desktop MCP transport.
 *
 * `apps/studio/src/desktop/` is Studio's Tauri-only area, the same role
 * `packages/host/src/tauri.ts` plays for environment capabilities: exactly one
 * place per application is allowed to import `@tauri-apps/*`, so a web build
 * cannot pull it in by accident. The lint guard enforces that.
 */
export const tauriCreativeMcpTransport: CreativeMcpTransport = {
  publishSnapshot: (tool, snapshot) => {
    invoke('set_mcp_creative_snapshot', { tool, snapshot }).catch(() => {});
  },

  onRequest: async (handler) => {
    const unlisten = await listen<CreativeMcpRequest>('feather://mcp-creative-request', (event) => {
      handler(event.payload);
    });
    return unlisten;
  },

  resolve: async (payload) => {
    await invoke('resolve_mcp_creative_request', payload);
  },
};
