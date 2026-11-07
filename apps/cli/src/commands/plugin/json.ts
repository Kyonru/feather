import { pluginCatalog } from '../../generated/plugin-catalog.js';

const catalogById = new Map(pluginCatalog.map((plugin) => [plugin.id, plugin]));

export function pluginSummaryJson(id: string, fallback: { name?: string; version?: string } = {}) {
  const catalog = catalogById.get(id);
  return {
    id,
    name: fallback.name || catalog?.name || id,
    version: fallback.version || catalog?.version || '',
    description: catalog?.description,
    capabilities: catalog?.capabilities ?? [],
    optIn: catalog?.optIn === true,
    disabled: catalog?.disabled === true,
  };
}
