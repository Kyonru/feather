import type { ShaderNodeInstance, ShaderEdge, GeneratedGlsl, ShaderNodeData, PortDef } from '@/types/shader-graph';
import { NODE_DEFS } from './nodeDefs';
import { glslFloat, shaderTextureUniformName } from './glslUtils';

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

function buildNodeBody(node: ShaderNodeInstance, edges: ShaderEdge[], nodeMap: Map<string, ShaderNodeInstance>): string[] {
  const def = NODE_DEFS[node.data.nodeType];
  if (!def?.emitGlsl) return [];

  const inVars: Record<string, string> = {};
  for (const port of def.inputs) {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === port.id);
    inVars[port.id] = edge?.sourceHandle
      ? outputExpression(nodeMap, edge.source, edge.sourceHandle)
      : defaultValue(port, node.data);
  }

  const outVars: Record<string, string> = {};
  for (const port of def.outputs) {
    outVars[port.id] = varName(node.id, port.id);
  }

  const glsl = def.emitGlsl(inVars, outVars, { ...node.data, __nodeId: node.id });
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
    `  return transform_projection * ${returnExpr};`,
    '}',
  ].join('\n');
}

export function codegen(nodes: ShaderNodeInstance[], edges: ShaderEdge[]): GeneratedGlsl {
  const fragOut = nodes.find((n) => n.data.nodeType === 'FragmentOutput');
  const vertOut = nodes.find((n) => n.data.nodeType === 'VertexOutput');

  if (!nodes.length || !fragOut) {
    return { pixel: PASSTHROUGH_PIXEL, vertex: null, hash: 'passthrough', textures: [] };
  }

  const reachable = collectReachable(fragOut.id, nodes, edges);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const externSet = new Set<string>();
  const helperKeys = new Set<string>();
  const textureMap = new Map<string, { nodeId: string; uniform: string; label: string }>();
  for (const node of reachable) {
    const def = NODE_DEFS[node.data.nodeType];
    def?.externs?.forEach((e) => externSet.add(e));
    if (def?.helperKey) helperKeys.add(def.helperKey);
    collectTextureUniform(node, textureMap, externSet);
  }

  let vertReachable: ShaderNodeInstance[] = [];
  if (vertOut) {
    vertReachable = collectReachable(vertOut.id, nodes, edges);
    for (const node of vertReachable) {
      const def = NODE_DEFS[node.data.nodeType];
      def?.externs?.forEach((e) => externSet.add(e));
      if (def?.helperKey) helperKeys.add(def.helperKey);
      collectTextureUniform(node, textureMap, externSet);
    }
  }

  const bodyLines: string[] = [];
  for (const node of reachable) {
    if (node.data.nodeType !== 'FragmentOutput') {
      bodyLines.push(...buildNodeBody(node, edges, nodeMap));
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
  parts.push(buildEffect(bodyLines, returnExpr));

  const pixel = parts.join('\n\n');

  let vertex: string | null = null;
  if (vertOut) {
    const vertLines: string[] = [];
    for (const node of vertReachable) {
      if (node.data.nodeType !== 'VertexOutput') {
        vertLines.push(...buildNodeBody(node, edges, nodeMap));
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
