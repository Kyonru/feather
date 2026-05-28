import type { XYPosition } from '@xyflow/react';
import type { GlslType, NodeType, PortDef, ShaderEdge, ShaderNodeData, ShaderNodeInstance, ShaderSubgraph } from '@/types/shader-graph';
import { DEFAULT_CUSTOM_FUNCTION_CODE } from './customNode';
import { getNodeDef, NODE_DEFS } from './nodeDefs';
import { clonePortDef, defaultBoundaryPort } from './subgraphBoundary';

let graphIdCounter = Date.now();

export function nextGraphId(prefix = 'node') {
  graphIdCounter += 1;
  return `${prefix}-${graphIdCounter}`;
}

export function defaultNodeData(nodeType: NodeType, label: string): ShaderNodeData {
  if (nodeType === 'CustomFunction') {
    return {
      label,
      nodeType,
      customCode: DEFAULT_CUSTOM_FUNCTION_CODE,
    };
  }
  if (nodeType === 'SubgraphInput') {
    return {
      label,
      nodeType,
      boundaryPort: defaultBoundaryPort('input', label),
    };
  }
  if (nodeType === 'SubgraphOutput') {
    return {
      label,
      nodeType,
      boundaryPort: defaultBoundaryPort('output', label),
    };
  }
  if (nodeType === 'Vec2Parameter') return { label, nodeType, values: { val: [0, 0] } };
  if (nodeType === 'Vec3Parameter') return { label, nodeType, values: { val: [0, 0, 0] } };
  if (nodeType === 'Vec4Parameter' || nodeType === 'ColorParameter') return { label, nodeType, values: { val: [1, 1, 1, 1] } };
  if (nodeType === 'BooleanParameter') return { label, nodeType, values: { val: 0 } };
  if (nodeType === 'FloatParameter') return { label, nodeType, values: { val: 0 } };
  return { label, nodeType };
}

export function cloneShaderNodeData(data: ShaderNodeData): ShaderNodeData {
  return {
    ...data,
    values: data.values
      ? Object.fromEntries(Object.entries(data.values).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
      : undefined,
    subgraphInputs: data.subgraphInputs?.map((port) => ({
      ...port,
      defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue,
    })),
    subgraphOutputs: data.subgraphOutputs?.map((port) => ({
      ...port,
      defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue,
    })),
    boundaryPort: data.boundaryPort && typeof data.boundaryPort === 'object'
      ? clonePortDef(data.boundaryPort as PortDef)
      : data.boundaryPort,
  };
}

export function addNodeAt(nodeType: NodeType, position: XYPosition): ShaderNodeInstance {
  const def = NODE_DEFS[nodeType];
  const id = nextGraphId();
  return {
    id,
    type: 'shaderNode',
    position,
    data: defaultNodeData(nodeType, def.label),
  };
}

export function cloneGraphFragment(
  nodes: ShaderNodeInstance[],
  edges: ShaderEdge[],
  position: XYPosition,
): { nodes: ShaderNodeInstance[]; edges: ShaderEdge[]; firstNodeId: string | null } {
  if (nodes.length === 0) return { nodes: [], edges: [], firstNodeId: null };

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const idMap = new Map(nodes.map((node) => [node.id, nextGraphId('node')]));

  const nextNodes = nodes.map((node) => {
    const id = idMap.get(node.id) ?? nextGraphId('node');
    return {
      ...node,
      id,
      selected: false,
      position: {
        x: position.x + (node.position.x - minX),
        y: position.y + (node.position.y - minY),
      },
      data: cloneShaderNodeData(node.data),
    };
  });

  const nextEdges = edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => {
      const source = idMap.get(edge.source) ?? edge.source;
      const target = idMap.get(edge.target) ?? edge.target;
      return {
        ...edge,
        id: `${source}:${edge.sourceHandle ?? 'out'}->${target}:${edge.targetHandle ?? 'in'}`,
        source,
        target,
      };
    });

  return { nodes: nextNodes, edges: nextEdges, firstNodeId: nextNodes[0]?.id ?? null };
}

function safeFunctionName(name: string, id: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'subgraph';
  const suffix = id.replace(/[^a-zA-Z0-9_]+/g, '_');
  return `feather_subgraph_${base}_${suffix}`;
}

function uniquePortId(base: string, used: Set<string>): string {
  let next = base.replace(/[^a-zA-Z0-9_]+/g, '_') || 'value';
  if (!/^[a-zA-Z_]/.test(next)) next = `value_${next}`;
  let i = 2;
  while (used.has(next)) {
    next = `${base}_${i}`;
    i += 1;
  }
  used.add(next);
  return next;
}

export function inferSubgraphFromSelection(
  allNodes: ShaderNodeInstance[],
  allEdges: ShaderEdge[],
  selectedIds: Set<string>,
  name: string,
): {
  subgraph: ShaderSubgraph;
  instance: ShaderNodeInstance;
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
} | null {
  const selectedNodes = allNodes.filter((node) => selectedIds.has(node.id));
  if (selectedNodes.length === 0) return null;

  const selectedIdSet = new Set(selectedNodes.map((node) => node.id));
  const internalEdges = allEdges.filter((edge) => selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target));
  const incomingEdges = allEdges.filter((edge) => !selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target));
  const outgoingEdges = allEdges.filter((edge) => selectedIdSet.has(edge.source) && !selectedIdSet.has(edge.target));
  const inputIds = new Set<string>();
  const outputIds = new Set<string>();
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  const inputMappings: ShaderSubgraph['inputMappings'] = {};
  const outputMappings: ShaderSubgraph['outputMappings'] = {};

  for (const edge of incomingEdges) {
    const targetNode = allNodes.find((node) => node.id === edge.target);
    const targetPort = targetNode ? getNodeDef(targetNode.data)?.inputs.find((port) => port.id === edge.targetHandle) : null;
    if (!targetNode || !targetPort) continue;
    const id = uniquePortId(`${targetNode.data.label || targetNode.id}_${targetPort.id}`, inputIds);
    inputs.push({ ...targetPort, id, label: targetPort.label });
    inputMappings[id] = { nodeId: targetNode.id, portId: targetPort.id };
  }

  for (const edge of outgoingEdges) {
    const sourceNode = allNodes.find((node) => node.id === edge.source);
    const sourcePort = sourceNode ? getNodeDef(sourceNode.data)?.outputs.find((port) => port.id === edge.sourceHandle) : null;
    if (!sourceNode || !sourcePort) continue;
    const id = uniquePortId(`${sourceNode.data.label || sourceNode.id}_${sourcePort.id}`, outputIds);
    outputs.push({ ...sourcePort, id, label: sourcePort.label });
    outputMappings[id] = { nodeId: sourceNode.id, portId: sourcePort.id };
  }

  if (outputs.length === 0) {
    const last = selectedNodes.at(-1);
    const fallback = last ? getNodeDef(last.data)?.outputs[0] : null;
    if (last && fallback) {
      const id = uniquePortId(`${last.data.label || last.id}_${fallback.id}`, outputIds);
      outputs.push({ ...fallback, id, label: fallback.label });
      outputMappings[id] = { nodeId: last.id, portId: fallback.id };
    }
  }

  const subgraphId = nextGraphId('subgraph');
  const center = selectedNodes.reduce(
    (acc, node) => ({ x: acc.x + node.position.x / selectedNodes.length, y: acc.y + node.position.y / selectedNodes.length }),
    { x: 0, y: 0 },
  );
  const minX = Math.min(...selectedNodes.map((node) => node.position.x));
  const minY = Math.min(...selectedNodes.map((node) => node.position.y));
  const subgraphNodes = selectedNodes.map((node) => ({
    ...node,
    selected: false,
    position: { x: node.position.x - minX, y: node.position.y - minY },
    data: cloneShaderNodeData(node.data),
  }));
  const subgraph: ShaderSubgraph = {
    id: subgraphId,
    name,
    functionName: safeFunctionName(name, subgraphId),
    nodes: subgraphNodes,
    edges: internalEdges.map((edge) => ({ ...edge })),
    inputs,
    outputs,
    inputMappings,
    outputMappings,
  };

  const instanceId = nextGraphId('node');
  const instance: ShaderNodeInstance = {
    id: instanceId,
    type: 'shaderNode',
    position: center,
    data: {
      label: name,
      nodeType: 'SubgraphInstance',
      subgraphId,
      subgraphInputs: inputs,
      subgraphOutputs: outputs,
    },
  };

  const inputEdges: ShaderEdge[] = [];
  for (const edge of incomingEdges) {
    const entry = Object.entries(inputMappings).find(([, mapping]) => mapping.nodeId === edge.target && mapping.portId === edge.targetHandle);
    if (!entry) continue;
    inputEdges.push({ ...edge, id: `${edge.source}:${edge.sourceHandle}->${instanceId}:${entry[0]}`, target: instanceId, targetHandle: entry[0] });
  }
  const outputEdges: ShaderEdge[] = [];
  for (const edge of outgoingEdges) {
    const entry = Object.entries(outputMappings).find(([, mapping]) => mapping.nodeId === edge.source && mapping.portId === edge.sourceHandle);
    if (!entry) continue;
    outputEdges.push({ ...edge, id: `${instanceId}:${entry[0]}->${edge.target}:${edge.targetHandle}`, source: instanceId, sourceHandle: entry[0] });
  }

  return {
    subgraph,
    instance,
    nodes: [...allNodes.filter((node) => !selectedIdSet.has(node.id)), instance],
    edges: [...allEdges.filter((edge) => !selectedIdSet.has(edge.source) && !selectedIdSet.has(edge.target)), ...inputEdges, ...outputEdges],
  };
}

export type PortRef = {
  nodeId: string;
  nodeLabel: string;
  portId: string;
  portLabel: string;
  type: GlslType;
  direction: 'input' | 'output';
};

export type LinkSuggestion =
  | { kind: 'connect'; label: string; target: PortRef }
  | { kind: 'node'; label: string; nodeType: NodeType }
  | { kind: 'recipe'; label: string; nodeType: NodeType; needsSecondOutput?: boolean };

export function portRefs(nodes: ShaderNodeInstance[], direction: 'input' | 'output'): PortRef[] {
  return nodes.flatMap((node) => {
    const def = getNodeDef(node.data);
    const ports = direction === 'input' ? def.inputs : def.outputs;
    return ports.map((port) => ({
      nodeId: node.id,
      nodeLabel: String(node.data.label || def.label),
      portId: port.id,
      portLabel: port.label,
      type: port.type,
      direction,
    }));
  });
}

function addNodeForType(type: GlslType): NodeType | null {
  if (type === 'float') return 'Add';
  if (type === 'vec2') return 'AddVec2';
  if (type === 'vec3') return 'AddVec3';
  if (type === 'vec4') return 'AddVec4';
  return null;
}

function scaleNodeForType(type: GlslType): NodeType | null {
  if (type === 'vec2') return 'ScaleVec2';
  if (type === 'vec3') return 'ScaleVec3';
  if (type === 'vec4') return 'ScaleVec4';
  return null;
}

export function linkSuggestions(nodes: ShaderNodeInstance[], port: PortRef): LinkSuggestion[] {
  const opposite = port.direction === 'output' ? 'input' : 'output';
  const direct = portRefs(nodes, opposite)
    .filter((candidate) => candidate.type === port.type && candidate.nodeId !== port.nodeId)
    .slice(0, 8)
    .map((candidate) => ({
      kind: 'connect' as const,
      label: `${candidate.nodeLabel} · ${candidate.portLabel}`,
      target: candidate,
    }));

  const suggestions: LinkSuggestion[] = [...direct];
  const addNode = addNodeForType(port.type);
  if (addNode) suggestions.push({ kind: 'recipe', label: `Combine with ${NODE_DEFS[addNode].label}`, nodeType: addNode, needsSecondOutput: true });
  const scaleNode = scaleNodeForType(port.type);
  if (scaleNode) suggestions.push({ kind: 'node', label: `Scale with Float`, nodeType: scaleNode });
  if (port.type === 'vec4') {
    suggestions.push(
      { kind: 'recipe', label: 'Merge effects with Blend Add', nodeType: 'BlendAdd', needsSecondOutput: true },
      { kind: 'recipe', label: 'Merge effects with Screen', nodeType: 'BlendScreen', needsSecondOutput: true },
      { kind: 'recipe', label: 'Mix effects with Lerp Vec4', nodeType: 'LerpVec4', needsSecondOutput: true },
      { kind: 'recipe', label: 'Composite alpha layers', nodeType: 'CompositeAlpha', needsSecondOutput: true },
    );
  }
  if (port.type === 'image') suggestions.push({ kind: 'node', label: 'Sample with Texture Uniform Color', nodeType: 'TextureUniformColor' });
  if (port.type === 'vec2') suggestions.push({ kind: 'node', label: 'Sample texture at UV', nodeType: 'TextureUniformColor' });
  return suggestions.slice(0, 14);
}
