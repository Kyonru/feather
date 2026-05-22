import type { ShaderNodeInstance, ShaderEdge, GeneratedGlsl, ShaderNodeData, PortDef, ShaderSubgraph } from '@/types/shader-graph';
import { getNodeDef, NODE_DEFS } from './nodeDefs';
import { glslFloat, shaderTextureUniformName } from './glslUtils';
import { customFunctionSource, validateCustomFunctionSource } from './customNode';

export const PASSTHROUGH_PIXEL = [
  'vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {',
  '  return Texel(tex, texture_coords) * color;',
  '}',
].join('\n');

const NOISE_HELPER = [
  'float feather_hash(vec2 p) {',
  '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
  '}',
].join('\n');

const LAB_COLOR_HELPER = [
  'vec3 feather_lab_f(vec3 t) {',
  '  return mix(7.7870370374 * t + vec3(0.13793103448), pow(max(t, vec3(0.0)), vec3(0.3333333333)), step(vec3(0.00885645167), t));',
  '}',
  'vec3 feather_lab_f_inv(vec3 t) {',
  '  return mix(0.12841854934 * (t - vec3(0.13793103448)), t * t * t, step(vec3(0.20689655172), t));',
  '}',
  'vec3 feather_rgb_to_lab(vec3 rgb) {',
  '  mat3 rgbToXyz = mat3(0.4124564, 0.2126729, 0.0193339, 0.3575761, 0.7151522, 0.1191920, 0.1804375, 0.0721750, 0.9503041);',
  '  vec3 xyz = (rgbToXyz * clamp(rgb, 0.0, 1.0)) / vec3(0.95047, 1.0, 1.08883);',
  '  vec3 f = feather_lab_f(xyz);',
  '  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));',
  '}',
  'vec3 feather_lab_to_rgb(vec3 lab) {',
  '  mat3 xyzToRgb = mat3(3.2404542, -0.9692660, 0.0556434, -1.5371385, 1.8760108, -0.2040259, -0.4985314, 0.0415560, 1.0572252);',
  '  vec3 f = vec3(lab.y / 500.0, 0.0, -lab.z / 200.0) + vec3((lab.x + 16.0) / 116.0);',
  '  vec3 xyz = vec3(0.95047, 1.0, 1.08883) * feather_lab_f_inv(f);',
  '  return clamp(xyzToRgb * xyz, 0.0, 1.0);',
  '}',
  'vec3 feather_lab_to_lch(vec3 lab) {',
  '  return vec3(lab.x, length(lab.yz), atan(lab.z, lab.y));',
  '}',
  'vec3 feather_lch_to_lab(vec3 lch) {',
  '  return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));',
  '}',
].join('\n');

function varName(nodeId: string, portId: string): string {
  return `v_${nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}_${portId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function defaultValue(port: PortDef, nodeData: ShaderNodeData): string {
  const type = port.type;
  const val = nodeData.values?.[port.id] ?? port.defaultValue;

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
    case 'image':
      return 'tex';
    default:
      return '0.0';
  }
}

function outputExpression(nodeMap: Map<string, ShaderNodeInstance>, nodeId: string, portId: string): string {
  const node = nodeMap.get(nodeId);
  if (node?.data.nodeType === 'TextureInput' && portId === 'texture') {
    return shaderTextureUniformName(node.id, node.data.uniformName);
  }
  return varName(nodeId, portId);
}

function outputExpressionWithOverrides(
  nodeMap: Map<string, ShaderNodeInstance>,
  nodeId: string,
  portId: string,
  outputOverrides: Map<string, string>,
): string {
  return outputOverrides.get(`${nodeId}:${portId}`) ?? outputExpression(nodeMap, nodeId, portId);
}

function collectTextureUniform(node: ShaderNodeInstance, textureMap: Map<string, { nodeId: string; uniform: string; label: string }>, externSet: Set<string>) {
  if (node.data.nodeType !== 'TextureInput' && node.data.nodeType !== 'TextureUniformColor') return;
  const uniform = shaderTextureUniformName(node.id, node.data.uniformName);
  externSet.add(`extern Image ${uniform};`);
  textureMap.set(uniform, {
    nodeId: node.id,
    uniform,
    label: String(node.data.label || NODE_DEFS[node.data.nodeType].label),
  });
}

function buildNodeBody(
  node: ShaderNodeInstance,
  edges: ShaderEdge[],
  nodeMap: Map<string, ShaderNodeInstance>,
  subgraphMap: Map<string, ShaderSubgraph>,
  inputOverrides = new Map<string, string>(),
  outputOverrides = new Map<string, string>(),
): string[] {
  const def = getNodeDef(node.data);
  if (!def?.emitGlsl) return [];

  if (node.data.nodeType === 'SubgraphInstance') {
    const subgraph = node.data.subgraphId ? subgraphMap.get(node.data.subgraphId) : null;
    if (!subgraph) return [`// Missing subgraph: ${String(node.data.subgraphId ?? 'unknown')}`];
    const inputArgs = subgraph.inputs.map((port) => {
      const edge = edges.find((e) => e.target === node.id && e.targetHandle === port.id);
      return edge?.sourceHandle
        ? outputExpressionWithOverrides(nodeMap, edge.source, edge.sourceHandle, outputOverrides)
        : defaultValue(port, node.data);
    });
    const outVars: Record<string, string> = {};
    for (const port of subgraph.outputs) outVars[port.id] = varName(node.id, port.id);
    const declarations = subgraph.outputs.map((port) => `${port.type} ${outVars[port.id]};`);
    const outArgs = subgraph.outputs.map((port) => outVars[port.id]);
    return [...declarations, `${subgraph.functionName}(${[...inputArgs, ...outArgs].join(', ')});`];
  }

  const inVars: Record<string, string> = {};
  for (const port of def.inputs) {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === port.id);
    inVars[port.id] = inputOverrides.get(`${node.id}:${port.id}`) ??
      (edge?.sourceHandle
        ? outputExpressionWithOverrides(nodeMap, edge.source, edge.sourceHandle, outputOverrides)
        : defaultValue(port, node.data));
  }

  const outVars: Record<string, string> = {};
  for (const port of def.outputs) {
    outVars[port.id] = varName(node.id, port.id);
  }

  const glsl = def.emitGlsl(inVars, outVars, { ...node.data, __nodeId: node.id });
  return glsl ? glsl.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

function collectCustomFunction(node: ShaderNodeInstance, customFunctionSet: Set<string>) {
  if (node.data.nodeType !== 'CustomFunction') return;
  const source = customFunctionSource(node.data);
  if (!validateCustomFunctionSource(source).signature) return;
  customFunctionSet.add(source);
}

function collectReachable(startId: string, nodes: ShaderNodeInstance[], edges: ShaderEdge[], stopAt = new Set<string>()): ShaderNodeInstance[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const ordered: ShaderNodeInstance[] = [];

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    if (!stopAt.has(id)) {
      for (const edge of edges) {
        if (edge.target === id) dfs(edge.source);
      }
    }
    const node = nodeMap.get(id);
    if (node) ordered.push(node);
  }

  dfs(startId);
  return ordered;
}

function collectGraphMetadata(
  nodes: ShaderNodeInstance[],
  externSet: Set<string>,
  helperKeys: Set<string>,
  customFunctionSet: Set<string>,
  textureMap: Map<string, { nodeId: string; uniform: string; label: string }>,
) {
  for (const node of nodes) {
    const def = getNodeDef(node.data);
    def?.externs?.forEach((e) => externSet.add(e));
    if (def?.helperKey) helperKeys.add(def.helperKey);
    collectTextureUniform(node, textureMap, externSet);
    collectCustomFunction(node, customFunctionSet);
  }
}

function buildSubgraphFunction(
  subgraph: ShaderSubgraph,
  subgraphMap: Map<string, ShaderSubgraph>,
  stack = new Set<string>(),
): string {
  if (stack.has(subgraph.id)) {
    return `// Subgraph cycle detected: ${subgraph.name}`;
  }
  stack.add(subgraph.id);
  const nodeMap = new Map(subgraph.nodes.map((node) => [node.id, node]));
  const inputOverrides = new Map(
    Object.entries(subgraph.inputMappings).map(([inputId, mapping]) => [`${mapping.nodeId}:${mapping.portId}`, `sg_in_${inputId}`]),
  );
  const outputOverrides = new Map<string, string>();
  const reachableIds = new Set<string>();
  for (const mapping of Object.values(subgraph.outputMappings)) {
    for (const node of collectReachable(mapping.nodeId, subgraph.nodes, subgraph.edges, new Set())) {
      reachableIds.add(node.id);
    }
  }
  const bodyLines: string[] = [];
  for (const node of subgraph.nodes.filter((node) => reachableIds.has(node.id))) {
    bodyLines.push(...buildNodeBody(node, subgraph.edges, nodeMap, subgraphMap, inputOverrides, outputOverrides));
  }
  for (const [outputId, mapping] of Object.entries(subgraph.outputMappings)) {
    bodyLines.push(`sg_out_${outputId} = ${outputExpressionWithOverrides(nodeMap, mapping.nodeId, mapping.portId, outputOverrides)};`);
  }
  const args = [
    ...subgraph.inputs.map((port) => `${port.type} sg_in_${port.id}`),
    ...subgraph.outputs.map((port) => `out ${port.type} sg_out_${port.id}`),
  ];
  stack.delete(subgraph.id);
  return [
    `void ${subgraph.functionName}(${args.join(', ')}) {`,
    ...bodyLines.map((line) => `  ${line}`),
    '}',
  ].join('\n');
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
    `  return transform_projection * ${returnExpr};`,
    '}',
  ].join('\n');
}

function collectUsedSubgraphs(
  nodes: ShaderNodeInstance[],
  subgraphMap: Map<string, ShaderSubgraph>,
  used = new Set<string>(),
  visiting = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    if (node.data.nodeType !== 'SubgraphInstance' || !node.data.subgraphId || used.has(node.data.subgraphId)) continue;
    const subgraph = subgraphMap.get(node.data.subgraphId);
    if (!subgraph) continue;
    if (visiting.has(subgraph.id)) {
      used.add(subgraph.id);
      continue;
    }
    visiting.add(subgraph.id);
    collectUsedSubgraphs(subgraph.nodes, subgraphMap, used, visiting);
    visiting.delete(subgraph.id);
    used.add(subgraph.id);
  }
  return used;
}

export function codegen(nodes: ShaderNodeInstance[], edges: ShaderEdge[], subgraphs: ShaderSubgraph[] = []): GeneratedGlsl {
  const fragOut = nodes.find((n) => n.data.nodeType === 'FragmentOutput');
  const vertOut = nodes.find((n) => n.data.nodeType === 'VertexOutput');
  const subgraphMap = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph]));

  if (!nodes.length || !fragOut) {
    return { pixel: PASSTHROUGH_PIXEL, vertex: null, hash: 'passthrough', textures: [] };
  }

  const reachable = collectReachable(fragOut.id, nodes, edges);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const externSet = new Set<string>();
  const helperKeys = new Set<string>();
  const customFunctionSet = new Set<string>();
  const textureMap = new Map<string, { nodeId: string; uniform: string; label: string }>();
  collectGraphMetadata(reachable, externSet, helperKeys, customFunctionSet, textureMap);

  let vertReachable: ShaderNodeInstance[] = [];
  if (vertOut) {
    vertReachable = collectReachable(vertOut.id, nodes, edges);
    collectGraphMetadata(vertReachable, externSet, helperKeys, customFunctionSet, textureMap);
  }
  const usedSubgraphs = collectUsedSubgraphs([...reachable, ...vertReachable], subgraphMap);
  for (const subgraphId of usedSubgraphs) {
    const subgraph = subgraphMap.get(subgraphId);
    if (subgraph) collectGraphMetadata(subgraph.nodes, externSet, helperKeys, customFunctionSet, textureMap);
  }

  const bodyLines: string[] = [];
  for (const node of reachable) {
    if (node.data.nodeType !== 'FragmentOutput') {
      bodyLines.push(...buildNodeBody(node, edges, nodeMap, subgraphMap));
    }
  }

  const fragColorEdge = edges.find((e) => e.target === fragOut.id && e.targetHandle === 'color');
  const returnExpr = fragColorEdge?.sourceHandle
    ? outputExpression(nodeMap, fragColorEdge.source, fragColorEdge.sourceHandle)
    : 'Texel(tex, texture_coords)';

  const parts: string[] = [];
  if (externSet.size) parts.push([...externSet].join('\n'));
  if (helperKeys.has('noise')) parts.push(NOISE_HELPER);
  if (helperKeys.has('lab-color')) parts.push(LAB_COLOR_HELPER);
  if (customFunctionSet.size) parts.push([...customFunctionSet].join('\n\n'));
  if (usedSubgraphs.size) {
    parts.push(
      [...usedSubgraphs]
        .map((id) => subgraphMap.get(id))
        .filter((subgraph): subgraph is ShaderSubgraph => Boolean(subgraph))
        .map((subgraph) => buildSubgraphFunction(subgraph, subgraphMap))
        .join('\n\n'),
    );
  }
  parts.push(buildEffect(bodyLines, returnExpr));

  const pixel = parts.join('\n\n');

  let vertex: string | null = null;
  if (vertOut) {
    const vertLines: string[] = [];
    for (const node of vertReachable) {
      if (node.data.nodeType !== 'VertexOutput') {
        vertLines.push(...buildNodeBody(node, edges, nodeMap, subgraphMap));
      }
    }
    const posEdge = edges.find((e) => e.target === vertOut.id && e.targetHandle === 'pos');
    const vertReturn = posEdge?.sourceHandle
      ? outputExpression(nodeMap, posEdge.source, posEdge.sourceHandle)
      : 'vertex_position';

    vertex = buildPosition(vertLines, vertReturn);
  }

  const hash = btoa(pixel.slice(0, 64)).slice(0, 16);
  return { pixel, vertex, hash, textures: [...textureMap.values()] };
}
