import { useCallback, useState } from 'react';

export type PersistedPanelLayout = Record<string, number>;

const STORAGE_PREFIX = 'feather-studio:panel-layout:';

function validLayout(value: unknown, panelIds: readonly string[]): value is PersistedPanelLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== panelIds.length) return false;
  return panelIds.every((id) => {
    const size = (value as Record<string, unknown>)[id];
    return typeof size === 'number' && Number.isFinite(size) && size > 0;
  });
}

function readLayout(storageKey: string, panelIds: readonly string[]): PersistedPanelLayout | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}${storageKey}`);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return validLayout(parsed, panelIds) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist a resizable workbench only after the pointer/keyboard interaction
 * finishes. Layout is UI preference state, not creative workspace data, so it
 * deliberately stays out of exported Studio workspaces.
 */
export function usePersistedPanelLayout(storageKey: string, panelIds: readonly string[]) {
  const [defaultLayout] = useState(() => readLayout(storageKey, panelIds));
  const onLayoutChanged = useCallback(
    (layout: PersistedPanelLayout) => {
      if (!validLayout(layout, panelIds)) return;
      try {
        globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(layout));
      } catch (error) {
        console.warn(`[Feather] Could not persist ${storageKey} panel layout:`, error);
      }
    },
    [panelIds, storageKey],
  );

  return { defaultLayout, onLayoutChanged };
}
