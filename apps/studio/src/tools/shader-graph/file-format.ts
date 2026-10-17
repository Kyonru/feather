import { NODE_TYPES } from '@studio/types/shader-graph';
import type {
  GeneratedGlsl,
  GlslType,
  PlaygroundTarget,
  PortDef,
  ShaderEdge,
  ShaderNodeData,
  ShaderNodeInstance,
  ShaderSubgraph,
} from '@studio/types/shader-graph';

export const SHADER_GRAPH_FILE_VERSION = 3;

export type FeatherShaderGraphFile = {
  type: 'feather.shader-graph';
  version: number;
  exportedAt: string;
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  subgraphs: ShaderSubgraph[];
  activeTemplateInstanceId?: string | null;
  lastGeneratedGlsl?: GeneratedGlsl | null;
};

const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
const GLSL_TYPES = new Set<GlslType>(['float', 'vec2', 'vec3', 'vec4', 'mat4', 'image']);
const MAX_NODES = 5_000;
const MAX_EDGES = 10_000;
const MAX_SUBGRAPHS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max = 256): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Keep imported extension data JSON-only, bounded, and free of prototype keys. */
function safeJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.slice(0, 256).map((item) => safeJson(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '__proto__' && key !== 'prototype' && key !== 'constructor')
      .slice(0, 256)
      .flatMap(([key, entry]) => {
        const normalized = safeJson(entry, depth + 1);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
  );
}

function normalizeNode(raw: unknown, label: string): ShaderNodeInstance {
  if (!isRecord(raw) || !isRecord(raw.data) || !isRecord(raw.position)) {
    throw new Error(`${label} must contain id, position and data`);
  }
  const nodeId = id(raw.id, `${label}.id`);
  const nodeType = raw.data.nodeType;
  if (typeof nodeType !== 'string' || !NODE_TYPE_SET.has(nodeType)) {
    throw new Error(`${label}.data.nodeType is not a supported shader node`);
  }
  const data = safeJson(raw.data);
  if (!isRecord(data)) throw new Error(`${label}.data is not usable`);
  return {
    id: nodeId,
    type: 'shaderNode',
    position: { x: finite(raw.position.x), y: finite(raw.position.y) },
    data: {
      ...(data as ShaderNodeData),
      nodeType: nodeType as ShaderNodeData['nodeType'],
      label: text(data.label, nodeType),
    },
    selected: false,
  };
}

function normalizeNodes(raw: unknown, label: string): ShaderNodeInstance[] {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  if (raw.length > MAX_NODES) throw new Error(`${label} has more than ${MAX_NODES} nodes`);
  const nodes = raw.map((entry, index) => normalizeNode(entry, `${label}[${index}]`));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error(`${label} contains duplicate node ids`);
  return nodes;
}

function normalizeEdges(raw: unknown, nodeIds: Set<string>, label: string): ShaderEdge[] {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  if (raw.length > MAX_EDGES) throw new Error(`${label} has more than ${MAX_EDGES} edges`);
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label}[${index}] must be an object`);
    const edgeId = id(entry.id, `${label}[${index}].id`);
    const source = id(entry.source, `${label}[${index}].source`);
    const target = id(entry.target, `${label}[${index}].target`);
    if (seen.has(edgeId)) throw new Error(`${label} contains duplicate edge ids`);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error(`${label}[${index}] points to a missing node`);
    seen.add(edgeId);
    return {
      id: edgeId,
      source,
      target,
      sourceHandle: typeof entry.sourceHandle === 'string' ? entry.sourceHandle.slice(0, 256) : null,
      targetHandle: typeof entry.targetHandle === 'string' ? entry.targetHandle.slice(0, 256) : null,
      type: 'default',
      selected: false,
    };
  });
}

function normalizePort(raw: unknown, label: string): PortDef {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const type = raw.type;
  if (typeof type !== 'string' || !GLSL_TYPES.has(type as GlslType)) throw new Error(`${label}.type is invalid`);
  const defaultValue = Array.isArray(raw.defaultValue)
    ? raw.defaultValue.slice(0, 16).map((value) => finite(value))
    : typeof raw.defaultValue === 'number'
      ? finite(raw.defaultValue)
      : undefined;
  return {
    id: id(raw.id, `${label}.id`),
    label: text(raw.label, String(raw.id)),
    type: type as GlslType,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(Number.isFinite(Number(raw.min)) ? { min: Number(raw.min) } : {}),
    ...(Number.isFinite(Number(raw.max)) ? { max: Number(raw.max) } : {}),
    ...(Number.isFinite(Number(raw.step)) ? { step: Number(raw.step) } : {}),
    ...(raw.uiRole === 'source' || raw.uiRole === 'control' || raw.uiRole === 'texture' ? { uiRole: raw.uiRole } : {}),
  };
}

function normalizeMappings(raw: unknown): Record<string, { nodeId: string; portId: string }> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      if (!isRecord(value) || typeof value.nodeId !== 'string' || typeof value.portId !== 'string') return [];
      return [[text(key, '', 256), { nodeId: value.nodeId.slice(0, 256), portId: value.portId.slice(0, 256) }]];
    }).filter(([key]) => Boolean(key)),
  );
}

function normalizeSubgraph(raw: unknown, index: number): ShaderSubgraph {
  const label = `subgraphs[${index}]`;
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const nodes = normalizeNodes(raw.nodes, `${label}.nodes`);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    id: id(raw.id, `${label}.id`),
    name: text(raw.name, `Subgraph ${index + 1}`),
    functionName: text(raw.functionName, `feather_subgraph_${index + 1}`),
    nodes,
    edges: normalizeEdges(raw.edges, nodeIds, `${label}.edges`),
    inputs: Array.isArray(raw.inputs) ? raw.inputs.slice(0, 64).map((port, portIndex) => normalizePort(port, `${label}.inputs[${portIndex}]`)) : [],
    outputs: Array.isArray(raw.outputs) ? raw.outputs.slice(0, 64).map((port, portIndex) => normalizePort(port, `${label}.outputs[${portIndex}]`)) : [],
    inputMappings: normalizeMappings(raw.inputMappings),
    outputMappings: normalizeMappings(raw.outputMappings),
  };
}

/** Coerce a user-authored shader graph once, before it reaches stores or rendering. */
export function parseShaderGraphFile(input: unknown): FeatherShaderGraphFile {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isRecord(parsed)) throw new Error('Shader graph input must be a JSON object or string');
  if (parsed.type !== 'feather.shader-graph' || ![1, 2, SHADER_GRAPH_FILE_VERSION].includes(Number(parsed.version))) {
    throw new Error('Unsupported shader graph file');
  }

  const nodes = normalizeNodes(parsed.nodes, 'nodes');
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeEdges(parsed.edges, nodeIds, 'edges');
  const rawSubgraphs = Array.isArray(parsed.subgraphs) ? parsed.subgraphs : [];
  if (rawSubgraphs.length > MAX_SUBGRAPHS) throw new Error(`subgraphs has more than ${MAX_SUBGRAPHS} entries`);
  const subgraphs = rawSubgraphs.map(normalizeSubgraph);
  const subgraphIds = new Set(subgraphs.map((subgraph) => subgraph.id));
  if (subgraphIds.size !== subgraphs.length) throw new Error('subgraphs contains duplicate ids');

  const target = isRecord(parsed.playgroundTarget)
    && typeof parsed.playgroundTarget.composite === 'string'
    && Number.isInteger(Number(parsed.playgroundTarget.systemIndex))
    && Number(parsed.playgroundTarget.systemIndex) > 0
    ? {
        composite: parsed.playgroundTarget.composite.slice(0, 256),
        systemIndex: Number(parsed.playgroundTarget.systemIndex),
      }
    : null;
  const activeTemplateInstanceId =
    typeof parsed.activeTemplateInstanceId === 'string' && nodeIds.has(parsed.activeTemplateInstanceId)
      ? parsed.activeTemplateInstanceId
      : null;

  return {
    type: 'feather.shader-graph',
    version: SHADER_GRAPH_FILE_VERSION,
    exportedAt: text(parsed.exportedAt, new Date().toISOString(), 64),
    shaderName: text(parsed.shaderName, 'my-shader', 128),
    playgroundTarget: target,
    nodes,
    edges,
    subgraphs,
    activeTemplateInstanceId,
    // Generated output is a cache, not source. Rebuilding it from the coerced
    // graph avoids rendering or exporting stale third-party values.
    lastGeneratedGlsl: null,
  };
}
