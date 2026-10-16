export type PluginNavItem = {
  id: string;
  name: string;
  url: string;
  icon?: string;
  disabled: boolean;
};

/**
 * Build the sidebar's plugin entries from the running game's config.
 *
 * Its own module, with no React in it, because the values here are the least
 * trustworthy in the app: `tabName` and `icon` are written in a third-party
 * plugin's Lua manifest and reach us through a config payload nothing validates.
 * Feather's own runtime is disciplined about its payloads — this is the seam
 * where somebody else's code decides what we render.
 *
 * The old truthiness check (`if (value.tabName)`) admitted any truthy value, so
 * a manifest with `tabName = 1234` produced an item whose `name` was a number.
 * Sorting called `.localeCompare` on it and the plugin search called
 * `.toLowerCase()`, and this list is the sidebar — one odd manifest would have
 * taken navigation down for the whole app.
 *
 * See V4.md §6.3 (6.7, C5).
 */
export function pluginNavItems(plugins: Record<string, unknown> | undefined): PluginNavItem[] {
  if (!plugins || typeof plugins !== 'object') return [];

  const items: PluginNavItem[] = [];
  for (const [id, raw] of Object.entries(plugins)) {
    if (!raw || typeof raw !== 'object') continue;
    const value = raw as { tabName?: unknown; icon?: unknown; disabled?: unknown };
    if (!value.tabName) continue;

    // Coerced, not trusted. A name that is not a string is still shown — the
    // plugin exists and hiding it would be a worse answer than displaying "1234"
    // — but it can no longer break the list it appears in.
    const name = typeof value.tabName === 'string' ? value.tabName : String(value.tabName);

    items.push({
      id,
      name,
      url: `/plugins/${id}`,
      icon: typeof value.icon === 'string' ? value.icon : undefined,
      disabled: value.disabled === true,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}
