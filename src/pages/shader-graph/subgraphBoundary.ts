import type { GlslType, PortDef, ShaderNodeData, ShaderNodeInstance, ShaderSubgraph, SubgraphPortRole } from '@/types/shader-graph';

const GLSL_TYPES: GlslType[] = ['float', 'vec2', 'vec3', 'vec4', 'mat4', 'image'];
const SUBGRAPH_PORT_ROLES: SubgraphPortRole[] = ['source', 'control', 'texture'];

function fallbackDefaultValue(type: GlslType): number | number[] | undefined {
  if (type === 'float') return 0;
  if (type === 'vec2') return [0, 0];
  if (type === 'vec3') return [0, 0, 0];
  if (type === 'vec4') return [1, 1, 1, 1];
  return undefined;
}

function safePortId(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const next = raw.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!next) return fallback;
  return /^[a-zA-Z_]/.test(next) ? next : `${fallback}_${next}`;
}

function safeType(value: unknown, fallback: GlslType): GlslType {
  return GLSL_TYPES.includes(value as GlslType) ? value as GlslType : fallback;
}

function safeRole(value: unknown, fallback: SubgraphPortRole): SubgraphPortRole {
  return SUBGRAPH_PORT_ROLES.includes(value as SubgraphPortRole) ? value as SubgraphPortRole : fallback;
}

export function subgraphBoundaryPort(
  data: ShaderNodeData,
  direction: 'input' | 'output',
  fallbackId = direction === 'input' ? 'value' : 'rgba',
): PortDef {
  const raw = data.boundaryPort && typeof data.boundaryPort === 'object' ? data.boundaryPort as Partial<PortDef> : {};
  const type = safeType(raw.type, direction === 'output' ? 'vec4' : 'float');
  const id = safePortId(raw.id, fallbackId);
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : String(data.label || id);
  const uiRole = direction === 'input'
    ? safeRole(raw.uiRole, type === 'image' ? 'texture' : 'control')
    : undefined;

  return {
    id,
    label,
    type,
    ...(raw.defaultValue !== undefined ? { defaultValue: raw.defaultValue } : { defaultValue: fallbackDefaultValue(type) }),
    ...(typeof raw.min === 'number' ? { min: raw.min } : {}),
    ...(typeof raw.max === 'number' ? { max: raw.max } : {}),
    ...(typeof raw.step === 'number' ? { step: raw.step } : {}),
    ...(uiRole ? { uiRole } : {}),
  };
}

export function defaultBoundaryPort(direction: 'input' | 'output', label: string): PortDef {
  if (direction === 'output') {
    return { id: 'rgba', label: label || 'RGBA', type: 'vec4', defaultValue: [0, 0, 0, 1] };
  }
  return { id: 'value', label: label || 'Value', type: 'float', defaultValue: 0, uiRole: 'control' };
}

export function clonePortDef(port: PortDef): PortDef {
  return {
    ...port,
    defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue,
  };
}

export function syncSubgraphBoundary(subgraph: ShaderSubgraph): ShaderSubgraph {
  const inputNodes = subgraph.nodes.filter((node) => node.data.nodeType === 'SubgraphInput');
  const outputNodes = subgraph.nodes.filter((node) => node.data.nodeType === 'SubgraphOutput');

  if (inputNodes.length === 0 && outputNodes.length === 0) return subgraph;

  const inputs = inputNodes.map((node) => clonePortDef(subgraphBoundaryPort(node.data, 'input')));
  const outputs = outputNodes.map((node) => clonePortDef(subgraphBoundaryPort(node.data, 'output')));
  const inputMappings: ShaderSubgraph['inputMappings'] = Object.fromEntries(
    inputNodes.map((node, index) => [inputs[index].id, { nodeId: node.id, portId: 'out' }]),
  );
  const outputMappings: ShaderSubgraph['outputMappings'] = Object.fromEntries(
    outputNodes.map((node, index) => [outputs[index].id, { nodeId: node.id, portId: 'out' }]),
  );

  return {
    ...subgraph,
    inputs,
    outputs,
    inputMappings,
    outputMappings,
  };
}

export function syncSubgraphInstances(
  nodes: ShaderNodeInstance[],
  subgraphs: ShaderSubgraph[],
): ShaderNodeInstance[] {
  const subgraphMap = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  return nodes.map((node) => {
    if (node.data.nodeType !== 'SubgraphInstance' || typeof node.data.subgraphId !== 'string') return node;
    const subgraph = subgraphMap.get(node.data.subgraphId);
    if (!subgraph) return node;
    return {
      ...node,
      data: {
        ...node.data,
        subgraphInputs: subgraph.inputs.map(clonePortDef),
        subgraphOutputs: subgraph.outputs.map(clonePortDef),
      },
    };
  });
}
