import type { ShaderNodeInstance, ShaderEdge, GeneratedGlsl, ShaderNodeData } from '@/types/shader-graph';
import { NODE_DEFS } from './nodeDefs';
import { glslFloat } from './glslUtils';

const PASSTHROUGH_PIXEL = [
  'vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {',
  '  return Texel(tex, texture_coords) * color;',
  '}',
].join('\n');

const NOISE_HELPER = [
  'float feather_hash(vec2 p) {',
  '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
  '}',
].join('\n');

function varName(nodeId: string, portId: string): string {
  return `v_${nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}_${portId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function defaultValue(type: string, nodeData: ShaderNodeData, portId: string): string {
  const val = nodeData.values?.[portId];

  switch (type) {
    case 'float':
      return glslFloat(val);
    case 'vec2': {
      const v = (val as number[]) ?? [0, 0];
      return `vec2(${glslFloat(v[0])}, ${glslFloat(v[1])})`;
    }
    case 'vec3': {
      const v = (val as number[]) ?? [0, 0, 0];
      return `vec3(${glslFloat(v[0])}, ${glslFloat(v[1])}, ${glslFloat(v[2])})`;
    }
    case 'vec4': {
      const v = (val as number[]) ?? [0, 0, 0, 1];
      return `vec4(${glslFloat(v[0])}, ${glslFloat(v[1])}, ${glslFloat(v[2])}, ${glslFloat(v[3])})`;
    }
    case 'mat4':
      return 'mat4(1.0)';
    default:
      return '0.0';
  }
}

function buildNodeBody(node: ShaderNodeInstance, edges: ShaderEdge[]): string[] {
  const def = NODE_DEFS[node.data.nodeType];
  if (!def?.emitGlsl) return [];

  const inVars: Record<string, string> = {};
  for (const port of def.inputs) {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === port.id);
    inVars[port.id] = edge?.sourceHandle
      ? varName(edge.source, edge.sourceHandle)
      : defaultValue(port.type, node.data, port.id);
  }

  const outVars: Record<string, string> = {};
  for (const port of def.outputs) {
    outVars[port.id] = varName(node.id, port.id);
  }

  const glsl = def.emitGlsl(inVars, outVars, node.data);
  return glsl ? glsl.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

function collectReachable(startId: string, nodes: ShaderNodeInstance[], edges: ShaderEdge[]): ShaderNodeInstance[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const ordered: ShaderNodeInstance[] = [];

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const edge of edges) {
      if (edge.target === id) dfs(edge.source);
    }
    const node = nodeMap.get(id);
    if (node) ordered.push(node);
  }

  dfs(startId);
  return ordered;
}

function buildEffect(bodyLines: string[], returnExpr: string): string {
  return [
    'vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {',
    ...bodyLines.map((l) => `  ${l}`),
    `  return ${returnExpr} * color;`,
    '}',
  ].join('\n');
}

function buildPosition(bodyLines: string[], returnExpr: string): string {
  return [
    'vec4 position(mat4 transform_projection, vec4 vertex_position) {',
    ...bodyLines.map((l) => `  ${l}`),
    `  return ${returnExpr};`,
    '}',
  ].join('\n');
}

export function codegen(nodes: ShaderNodeInstance[], edges: ShaderEdge[]): GeneratedGlsl {
  const fragOut = nodes.find((n) => n.data.nodeType === 'FragmentOutput');
  const vertOut = nodes.find((n) => n.data.nodeType === 'VertexOutput');

  if (!nodes.length || !fragOut) {
    return { pixel: PASSTHROUGH_PIXEL, vertex: null, hash: 'passthrough' };
  }

  const reachable = collectReachable(fragOut.id, nodes, edges);

  const externSet = new Set<string>();
  let needsNoise = false;
  for (const node of reachable) {
    const def = NODE_DEFS[node.data.nodeType];
    def?.externs?.forEach((e) => externSet.add(e));
    if (def?.helperKey === 'noise') needsNoise = true;
  }

  let vertReachable: ShaderNodeInstance[] = [];
  if (vertOut) {
    vertReachable = collectReachable(vertOut.id, nodes, edges);
    for (const node of vertReachable) {
      const def = NODE_DEFS[node.data.nodeType];
      def?.externs?.forEach((e) => externSet.add(e));
      if (def?.helperKey === 'noise') needsNoise = true;
    }
  }

  const bodyLines: string[] = [];
  for (const node of reachable) {
    if (node.data.nodeType !== 'FragmentOutput') {
      bodyLines.push(...buildNodeBody(node, edges));
    }
  }

  const fragColorEdge = edges.find((e) => e.target === fragOut.id && e.targetHandle === 'color');
  const returnExpr = fragColorEdge?.sourceHandle
    ? varName(fragColorEdge.source, fragColorEdge.sourceHandle)
    : 'Texel(tex, texture_coords)';

  const parts: string[] = [];
  if (externSet.size) parts.push([...externSet].join('\n'));
  if (needsNoise) parts.push(NOISE_HELPER);
  parts.push(buildEffect(bodyLines, returnExpr));

  const pixel = parts.join('\n\n');

  let vertex: string | null = null;
  if (vertOut) {
    const vertLines: string[] = [];
    for (const node of vertReachable) {
      if (node.data.nodeType !== 'VertexOutput') {
        vertLines.push(...buildNodeBody(node, edges));
      }
    }
    const posEdge = edges.find((e) => e.target === vertOut.id && e.targetHandle === 'pos');
    const vertReturn = posEdge?.sourceHandle
      ? varName(posEdge.source, posEdge.sourceHandle)
      : 'transform_projection * vertex_position';

    vertex = buildPosition(vertLines, vertReturn);
  }

  const hash = btoa(pixel.slice(0, 64)).slice(0, 16);
  return { pixel, vertex, hash };
}
