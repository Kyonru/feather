import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { STUDIO_PREFERENCE_KEYS, type StudioPreferencesPayload } from '@feather/session-bridge';

/**
 * A read-only legacy export adapter.
 *
 * Feather Studio is a separately installed application with its own storage
 * origin, so it cannot read this app's `settings-storage` key. On first pairing
 * it asks over the bridge, and this answers with the Studio-owned slice that the
 * in-place migration deliberately never deleted.
 *
 * Deliberately narrow. It renders nothing, mutates nothing, and imports no
 * Studio code — the field list comes from the shared bridge contract, which is
 * what lets Inspector produce the payload without the coupling coming back. Once
 * users have migrated this can be deleted outright.
 */

const LEGACY_KEY = 'settings-storage';
const PAYLOAD_VERSION = 1;

function readLegacySlice(): StudioPreferencesPayload | null {
  let parsed: unknown;
  try {
    const raw = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const state = (parsed as { state?: unknown } | null)?.state;
  if (!state || typeof state !== 'object') return null;

  const source = state as Record<string, unknown>;
  const payload: Record<string, unknown> = { version: PAYLOAD_VERSION };
  let found = false;

  for (const key of STUDIO_PREFERENCE_KEYS) {
    if (key in source) {
      payload[key] = source[key];
      found = true;
    }
  }

  // Nothing to hand over is a normal outcome, not a failure.
  return found ? (payload as unknown as StudioPreferencesPayload) : null;
}

/**
 * Answer export requests for as long as the app is running.
 *
 * Returns an unsubscribe function.
 */
export async function serveStudioPreferencesExport(): Promise<() => void> {
  return listen<{ id: string }>('feather://export-studio-preferences', (event) => {
    const id = event.payload?.id;
    if (!id) return;
    void invoke('resolve_studio_preferences_export', {
      id,
      payload: readLegacySlice(),
    }).catch(() => {});
  });
}
