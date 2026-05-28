import type { GlslType, ShaderEdge, ShaderGraphDiagnostic, ShaderNodeInstance, ShaderSubgraph, ShaderTextureUpload } from '@/types/shader-graph';
import { customFunctionSource, validateCustomFunctionSource } from './customNode';
import { getNodeDef } from './nodeDefs';

type GraphInput = {
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  subgraphs?: ShaderSubgraph[];
  textureUploads?: Record<string, ShaderTextureUpload | null | undefined>;
};

const TEXTURE_NODE_TYPES = new Set(['TextureInput', 'TextureUniformColor', 'TextureParameter']);

function nodeLabel(node: ShaderNodeInstance | undefined): string {
  if (!node) return 'Unknown node';
  const def = getNodeDef(node.data);
  return String(node.data.label || def.label || node.id);
}

function portTypeMatches(sourceType: GlslType, targetType: GlslType): boolean {
  return sourceType === targetType;
}

function collectReachableFromOutputs(nodes: ShaderNodeInstance[], edges: ShaderEdge[], includeSubgraphOutputs = false): Set<string> {
  const roots = nodes.filter((node) =>
    node.data.nodeType === 'FragmentOutput' ||
    node.data.nodeType === 'VertexOutput' ||
    (includeSubgraphOutputs && node.data.nodeType === 'SubgraphOutput')
  );
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const edge of edges) {
      if (edge.target === id) visit(edge.source);
    }
  }

  for (const root of roots) visit(root.id);
  return visited;
}

function detectSubgraphCycles(subgraphs: ShaderSubgraph[]): Set<string> {
  const subgraphMap = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const cyclic = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string) {
    if (visiting.has(id)) {
      for (const activeId of visiting) cyclic.add(activeId);
      cyclic.add(id);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    visiting.add(id);
    const subgraph = subgraphMap.get(id);
    for (const node of subgraph?.nodes ?? []) {
      if (node.data.nodeType === 'SubgraphInstance' && typeof node.data.subgraphId === 'string') {
        visit(node.data.subgraphId);
      }
    }
    visiting.delete(id);
  }

  for (const subgraph of subgraphs) visit(subgraph.id);
  return cyclic;
}

function diagnoseGraph(
  diagnostics: ShaderGraphDiagnostic[],
  nodes: ShaderNodeInstance[],
  edges: ShaderEdge[],
  subgraphMap: Map<string, ShaderSubgraph>,
  textureUploads: Record<string, ShaderTextureUpload | null | undefined>,
  options: { requireFragmentOutput: boolean; graphName?: string; requireExplicitSubgraphOutput?: boolean },
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const reachable = collectReachableFromOutputs(nodes, edges, Boolean(options.graphName));

  if (options.requireFragmentOutput && !nodes.some((node) => node.data.nodeType === 'FragmentOutput')) {
    diagnostics.push({
      severity: 'error',
      message: 'Add a Fragment Output node before validating or applying this shader.',
      stage: 'pixel',
    });
  }

  if (options.requireExplicitSubgraphOutput && !nodes.some((node) => node.data.nodeType === 'SubgraphOutput')) {
    diagnostics.push({
      severity: 'error',
      message: `${options.graphName} needs at least one Subgraph Output node to expose a reusable result.`,
      stage: 'graph',
    });
  }

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const sourceDef = source ? getNodeDef(source.data) : null;
    const targetDef = target ? getNodeDef(target.data) : null;
    const sourcePort = sourceDef?.outputs.find((port) => port.id === edge.sourceHandle);
    const targetPort = targetDef?.inputs.find((port) => port.id === edge.targetHandle);

    if (!source || !target || !sourcePort || !targetPort) {
      diagnostics.push({
        severity: 'error',
        message: `Remove stale connection${source || target ? ` near ${nodeLabel(source ?? target)}` : ''}; one endpoint no longer exists.`,
        nodeId: target?.id ?? source?.id,
        edgeId: edge.id,
        portId: String(edge.targetHandle ?? edge.sourceHandle ?? ''),
        stage: 'graph',
      });
      continue;
    }

    if (!portTypeMatches(sourcePort.type, targetPort.type)) {
      diagnostics.push({
        severity: 'error',
        message: `${nodeLabel(source)} outputs ${sourcePort.type}, but ${nodeLabel(target)} expects ${targetPort.type} on ${targetPort.label}.`,
        nodeId: target.id,
        edgeId: edge.id,
        portId: targetPort.id,
        stage: 'graph',
      });
    }
  }

  for (const node of nodes) {
    const def = getNodeDef(node.data);
    const incoming = edges.filter((edge) => edge.target === node.id);
    const connectedInputs = new Set(incoming.map((edge) => edge.targetHandle));

    if (!options.graphName && (node.data.nodeType === 'SubgraphInput' || node.data.nodeType === 'SubgraphOutput')) {
      diagnostics.push({
        severity: 'error',
        message: `${nodeLabel(node)} can only be used while editing inside a subgraph.`,
        nodeId: node.id,
        stage: 'graph',
      });
    }

    if (node.data.nodeType === 'CustomFunction') {
      const validation = validateCustomFunctionSource(customFunctionSource(node.data));
      if (!validation.signature || validation.errors.length > 0) {
        diagnostics.push({
          severity: 'error',
          message: `Fix ${nodeLabel(node)}: ${validation.errors[0] ?? 'custom function source is invalid.'}`,
          nodeId: node.id,
          stage: 'graph',
        });
      }
    }

    if (node.data.nodeType === 'SubgraphInstance') {
      const subgraph = typeof node.data.subgraphId === 'string' ? subgraphMap.get(node.data.subgraphId) : null;
      if (!subgraph) {
        diagnostics.push({
          severity: 'error',
          message: `${nodeLabel(node)} references a missing subgraph.`,
          nodeId: node.id,
          stage: 'graph',
        });
      }
    }

    if (options.graphName && node.data.nodeType === 'SubgraphOutput' && !connectedInputs.has('value')) {
      diagnostics.push({
        severity: 'error',
        message: `${nodeLabel(node)} is disconnected; connect an internal value to expose this output.`,
        nodeId: node.id,
        portId: 'value',
        stage: 'graph',
      });
    }

    if (TEXTURE_NODE_TYPES.has(node.data.nodeType) && reachable.has(node.id) && !textureUploads[node.id]) {
      diagnostics.push({
        severity: 'error',
        message: `Upload a texture for ${nodeLabel(node)} before previewing or applying.`,
        nodeId: node.id,
        stage: 'pixel',
      });
    }

    for (const port of def.inputs) {
      if (connectedInputs.has(port.id)) continue;
      if (node.data.nodeType === 'FragmentOutput' && port.id === 'color') {
        diagnostics.push({
          severity: 'warning',
          message: `${nodeLabel(node)} has no color input; GLSL will fall back to the source texture.`,
          nodeId: node.id,
          portId: port.id,
          stage: 'pixel',
        });
      } else if (node.data.nodeType === 'VertexOutput' && port.id === 'pos') {
        diagnostics.push({
          severity: 'info',
          message: `${nodeLabel(node)} has no position input; vertex output will use the original position.`,
          nodeId: node.id,
          portId: port.id,
          stage: 'vertex',
        });
      } else if (reachable.has(node.id) && def.inputs.length > 0 && port.defaultValue === undefined) {
        diagnostics.push({
          severity: 'warning',
          message: `${nodeLabel(node)} uses the default value for disconnected ${port.label}.`,
          nodeId: node.id,
          portId: port.id,
          stage: options.graphName ? 'graph' : 'pixel',
        });
      }
    }
  }
}

export function diagnoseShaderGraph({
  nodes,
  edges,
  subgraphs = [],
  textureUploads = {},
}: GraphInput): ShaderGraphDiagnostic[] {
  const diagnostics: ShaderGraphDiagnostic[] = [];
  const subgraphMap = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const cyclicSubgraphs = detectSubgraphCycles(subgraphs);

  diagnoseGraph(diagnostics, nodes, edges, subgraphMap, textureUploads, { requireFragmentOutput: true });

  for (const subgraph of subgraphs) {
    if (cyclicSubgraphs.has(subgraph.id)) {
      diagnostics.push({
        severity: 'error',
        message: `${subgraph.name} contains a cyclic subgraph reference.`,
        stage: 'graph',
      });
    }
    const hasBoundaryNodes = subgraph.nodes.some((node) => node.data.nodeType === 'SubgraphInput' || node.data.nodeType === 'SubgraphOutput');
    diagnoseGraph(diagnostics, subgraph.nodes, subgraph.edges, subgraphMap, textureUploads, {
      requireFragmentOutput: false,
      graphName: subgraph.name,
      requireExplicitSubgraphOutput: hasBoundaryNodes,
    });
  }

  return diagnostics;
}

export function hasBlockingDiagnostics(diagnostics: ShaderGraphDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
