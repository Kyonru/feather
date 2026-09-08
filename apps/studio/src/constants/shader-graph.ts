import { NODE_CATEGORIES, type NodeCategory } from '../types/shader-graph.ts';

export const DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES: NodeCategory[] = [
  'Complex',
  'Quaternion',
  'Symmetry',
  'Random',
  'Pattern',
  'Halftone',
  'Pixel Perfect',
  'Vertex',
  'SDF',
];

export function normalizeShaderGraphNodeCategories(
  categories: unknown,
  fallback: readonly NodeCategory[] = DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES,
): NodeCategory[] {
  if (!Array.isArray(categories)) return [...fallback];

  const valid = new Set<NodeCategory>(NODE_CATEGORIES);
  const seen = new Set<NodeCategory>();

  for (const category of categories) {
    if (typeof category !== 'string' || !valid.has(category as NodeCategory)) continue;
    seen.add(category as NodeCategory);
  }

  return NODE_CATEGORIES.filter((category) => seen.has(category));
}
