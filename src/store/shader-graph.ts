import type { Node, Edge } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShaderNodeData, PlaygroundTarget, GeneratedGlsl, ShaderPreviewShape, ShaderTextureUpload, ShaderSubgraph } from '@/types/shader-graph';
import { clonePortDef, syncSubgraphBoundary, syncSubgraphInstances } from '@/pages/shader-graph/subgraphBoundary';

type ValidationStatus = 'idle' | 'validating' | 'ok' | 'error';

type GraphSnapshot = {
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
  subgraphs: ShaderSubgraph[];
};

type ShaderGraphStore = {
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
  subgraphs: ShaderSubgraph[];
  undoStack: GraphSnapshot[];
  redoStack: GraphSnapshot[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  activeSubgraphId: string | null;
  subgraphBreadcrumb: string[];
  activeTemplateInstanceId: string | null;
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  previewShape: ShaderPreviewShape;
  previewColor: string;
  previewBaseTexture: ShaderTextureUpload | null;
  previewZoom: number;
  pinnedPreviewNodeIds: string[];
  textureUploads: Record<string, ShaderTextureUpload>;
  lastGeneratedGlsl: GeneratedGlsl | null;
  validationStatus: ValidationStatus;
  validationErrors: { pixelError?: string; vertexError?: string };
  hasInitializedExample: boolean;
  cleanGraphHash: string;

  setNodes: (nodes: Node<ShaderNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSubgraphs: (subgraphs: ShaderSubgraph[]) => void;
  addNode: (node: Node<ShaderNodeData>) => void;
  addNodesAndEdges: (nodes: Node<ShaderNodeData>[], edges: Edge[], selectedNodeId?: string | null) => void;
  replaceSelectionWithSubgraph: (input: {
    subgraph: ShaderSubgraph;
    nodes: Node<ShaderNodeData>[];
    edges: Edge[];
    selectedNodeId: string;
  }) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  removeEdge: (id: string) => void;
  updateNodeData: (id: string, patch: Partial<ShaderNodeData>) => void;
  unlinkNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  focusRootNode: (id: string) => void;
  selectEdge: (id: string | null) => void;
  enterSubgraph: (id: string) => void;
  exitSubgraph: () => void;
  setShaderName: (name: string) => void;
  setPlaygroundTarget: (target: PlaygroundTarget | null) => void;
  setActiveTemplateInstanceId: (id: string | null) => void;
  setPreviewShape: (shape: ShaderPreviewShape) => void;
  setPreviewColor: (color: string) => void;
  setPreviewBaseTexture: (texture: ShaderTextureUpload | null) => void;
  setPreviewZoom: (zoom: number) => void;
  togglePinnedPreviewNode: (nodeId: string) => void;
  setTextureUpload: (nodeId: string, upload: ShaderTextureUpload) => void;
  clearTextureUpload: (nodeId: string) => void;
  setLastGlsl: (glsl: GeneratedGlsl | null) => void;
  setValidationStatus: (status: ValidationStatus) => void;
  setValidationErrors: (errors: ShaderGraphStore['validationErrors']) => void;
  setHasInitializedExample: (hasInitializedExample: boolean) => void;
  markClean: () => void;
  isDirty: () => boolean;
  loadGraph: (graph: { nodes: Node<ShaderNodeData>[]; edges: Edge[]; subgraphs?: ShaderSubgraph[]; shaderName?: string; playgroundTarget?: PlaygroundTarget | null; activeTemplateInstanceId?: string | null }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const HISTORY_LIMIT = 100;
let storeIdCounter = Date.now();

function nextStoreGraphId(prefix: string): string {
  storeIdCounter += 1;
  return `${prefix}-${storeIdCounter}`;
}

function graphHash(state: Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs'>): string {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, subgraphs: state.subgraphs });
}

function snapshot(state: Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs'>): GraphSnapshot {
  return { nodes: state.nodes, edges: state.edges, subgraphs: state.subgraphs };
}

function sameGraph(a: GraphSnapshot, b: GraphSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneShaderNodeData(data: ShaderNodeData): ShaderNodeData {
  return {
    ...data,
    values: data.values
      ? Object.fromEntries(Object.entries(data.values).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
      : undefined,
    subgraphInputs: data.subgraphInputs?.map((port) => ({ ...port, defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue })),
    subgraphOutputs: data.subgraphOutputs?.map((port) => ({ ...port, defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue })),
    boundaryPort: data.boundaryPort && typeof data.boundaryPort === 'object'
      ? clonePortDef(data.boundaryPort as ShaderSubgraph['inputs'][number])
      : data.boundaryPort,
  };
}

function safeSubgraphFunctionName(name: string, id: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'subgraph';
  const suffix = id.replace(/[^a-zA-Z0-9_]+/g, '_');
  return `feather_subgraph_${base}_${suffix}`;
}

function clonePort(port: ShaderSubgraph['inputs'][number]) {
  return {
    ...port,
    defaultValue: Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue,
  };
}

type SubgraphCloneResult = {
  root: ShaderSubgraph;
  subgraphs: ShaderSubgraph[];
};

function cloneSubgraphTree(
  rootSubgraph: ShaderSubgraph,
  allSubgraphs: ShaderSubgraph[],
  name = rootSubgraph.name,
): SubgraphCloneResult {
  const subgraphMap = new Map(allSubgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const clonedBySourceId = new Map<string, ShaderSubgraph>();

  const cloneOne = (source: ShaderSubgraph, nextName = source.name): ShaderSubgraph => {
    const existing = clonedBySourceId.get(source.id);
    if (existing) return existing;

    const id = nextStoreGraphId('subgraph');
    const idMap = new Map(source.nodes.map((node) => [node.id, nextStoreGraphId('node')]));
    const mapNodeId = (nodeId: string) => idMap.get(nodeId) ?? nodeId;
    const clone: ShaderSubgraph = {
      ...source,
      id,
      name: nextName,
      functionName: safeSubgraphFunctionName(nextName, id),
      nodes: [],
      edges: [],
      inputs: source.inputs.map(clonePort),
      outputs: source.outputs.map(clonePort),
      inputMappings: Object.fromEntries(
        Object.entries(source.inputMappings).map(([portId, mapping]) => [portId, { ...mapping, nodeId: mapNodeId(mapping.nodeId) }]),
      ),
      outputMappings: Object.fromEntries(
        Object.entries(source.outputMappings).map(([portId, mapping]) => [portId, { ...mapping, nodeId: mapNodeId(mapping.nodeId) }]),
      ),
    };
    clonedBySourceId.set(source.id, clone);

    clone.nodes = source.nodes.map((node) => {
      const data = cloneShaderNodeData(node.data);
      if (data.nodeType === 'SubgraphInstance' && typeof data.subgraphId === 'string') {
        const nestedSource = subgraphMap.get(data.subgraphId);
        if (nestedSource) {
          const nestedClone = cloneOne(nestedSource);
          data.subgraphId = nestedClone.id;
          data.subgraphInputs = nestedClone.inputs.map(clonePort);
          data.subgraphOutputs = nestedClone.outputs.map(clonePort);
        }
      }
      return {
        ...node,
        id: mapNodeId(node.id),
        selected: false,
        data,
      };
    });

    clone.edges = source.edges.map((edge) => {
      const sourceId = mapNodeId(edge.source);
      const targetId = mapNodeId(edge.target);
      return {
        ...edge,
        id: `${sourceId}:${edge.sourceHandle ?? 'out'}->${targetId}:${edge.targetHandle ?? 'in'}`,
        source: sourceId,
        target: targetId,
      };
    });

    return clone;
  };

  const root = cloneOne(rootSubgraph, name);
  return { root, subgraphs: [...clonedBySourceId.values()] };
}

function activeGraph(state: Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs' | 'activeSubgraphId'>) {
  const subgraph = state.activeSubgraphId ? state.subgraphs.find((item) => item.id === state.activeSubgraphId) : null;
  return subgraph ? { nodes: subgraph.nodes, edges: subgraph.edges } : { nodes: state.nodes, edges: state.edges };
}

function patchActiveGraph(
  state: ShaderGraphStore,
  graph: Partial<Pick<GraphSnapshot, 'nodes' | 'edges'>>,
): Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs'> {
  if (!state.activeSubgraphId) {
    const subgraphs = state.subgraphs.map(syncSubgraphBoundary);
    return {
      nodes: syncSubgraphInstances(graph.nodes ?? state.nodes, subgraphs),
      edges: graph.edges ?? state.edges,
      subgraphs,
    };
  }

  const subgraphs = state.subgraphs.map((subgraph) =>
    subgraph.id === state.activeSubgraphId
      ? syncSubgraphBoundary({
        ...subgraph,
        nodes: graph.nodes ?? subgraph.nodes,
        edges: graph.edges ?? subgraph.edges,
      })
      : syncSubgraphBoundary(subgraph),
  );

  return {
    nodes: syncSubgraphInstances(state.nodes, subgraphs),
    edges: state.edges,
    subgraphs,
  };
}

function withHistory(
  state: ShaderGraphStore,
  patch: Partial<Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs' | 'selectedNodeId' | 'selectedEdgeId' | 'textureUploads' | 'pinnedPreviewNodeIds' | 'activeTemplateInstanceId'>>,
) {
  const before = snapshot(state);
  const after = {
    nodes: patch.nodes ?? state.nodes,
    edges: patch.edges ?? state.edges,
    subgraphs: patch.subgraphs ?? state.subgraphs,
  };

  if (sameGraph(before, after)) {
    return patch;
  }

  return {
    ...patch,
    undoStack: [...state.undoStack, before].slice(-HISTORY_LIMIT),
    redoStack: [],
    lastGeneratedGlsl: null,
    validationStatus: 'idle' as const,
    validationErrors: {},
  };
}

export const useShaderGraphStore = create<ShaderGraphStore>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      subgraphs: [],
      undoStack: [],
      redoStack: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      activeSubgraphId: null,
      subgraphBreadcrumb: [],
      activeTemplateInstanceId: null,
      shaderName: 'my-shader',
      playgroundTarget: null,
      previewShape: 'circle',
      previewColor: '#ffffff',
      previewBaseTexture: null,
      previewZoom: 1,
      pinnedPreviewNodeIds: [],
      textureUploads: {},
      lastGeneratedGlsl: null,
      validationStatus: 'idle',
      validationErrors: {},
      hasInitializedExample: false,
      cleanGraphHash: graphHash({ nodes: [], edges: [], subgraphs: [] }),

      setNodes: (nodes) => set((s) => withHistory(s, patchActiveGraph(s, { nodes }))),
      setEdges: (edges) => set((s) => withHistory(s, patchActiveGraph(s, { edges }))),
      setSubgraphs: (subgraphs) => set((s) => {
        const syncedSubgraphs = subgraphs.map(syncSubgraphBoundary);
        return withHistory(s, {
          nodes: syncSubgraphInstances(s.nodes, syncedSubgraphs),
          subgraphs: syncedSubgraphs,
        });
      }),
      addNode: (node) =>
        set((s) => {
          const graph = activeGraph(s);
          return withHistory(s, patchActiveGraph(s, { nodes: [...graph.nodes, node] }));
        }),
      addNodesAndEdges: (newNodes, newEdges, selectedNodeId = null) =>
        set((s) => {
          const graph = activeGraph(s);
          return withHistory(s, {
            ...patchActiveGraph(s, {
              nodes: [...graph.nodes.map((node) => ({ ...node, selected: false })), ...newNodes],
              edges: [...graph.edges, ...newEdges],
            }),
            selectedNodeId,
            selectedEdgeId: null,
          });
        }),
      replaceSelectionWithSubgraph: ({ subgraph, nodes, edges, selectedNodeId }) =>
        set((s) =>
          withHistory(s, {
            ...patchActiveGraph(s, { nodes, edges }),
            subgraphs: [...s.subgraphs.filter((item) => item.id !== subgraph.id), subgraph],
            selectedNodeId,
            selectedEdgeId: null,
          }),
        ),
      removeNode: (id) =>
        set((s) => {
          const graph = activeGraph(s);
          return withHistory(s, {
            ...patchActiveGraph(s, {
              nodes: graph.nodes.filter((n) => n.id !== id),
              edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
            }),
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
            activeTemplateInstanceId: s.activeTemplateInstanceId === id ? null : s.activeTemplateInstanceId,
            textureUploads: Object.fromEntries(Object.entries(s.textureUploads).filter(([nodeId]) => nodeId !== id)),
            pinnedPreviewNodeIds: s.pinnedPreviewNodeIds.filter((nodeId) => nodeId !== id),
          });
        }),
      removeNodes: (ids) =>
        set((s) => {
          const idSet = new Set(ids);
          if (idSet.size === 0) return {};
          const graph = activeGraph(s);
          const nextEdges = graph.edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target));
          const selectedEdgeStillExists = s.selectedEdgeId ? nextEdges.some((edge) => edge.id === s.selectedEdgeId) : false;
          return withHistory(s, {
            ...patchActiveGraph(s, {
              nodes: graph.nodes.filter((node) => !idSet.has(node.id)),
              edges: nextEdges,
            }),
            selectedNodeId: s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
            selectedEdgeId: selectedEdgeStillExists ? s.selectedEdgeId : null,
            activeTemplateInstanceId: s.activeTemplateInstanceId && idSet.has(s.activeTemplateInstanceId) ? null : s.activeTemplateInstanceId,
            textureUploads: Object.fromEntries(Object.entries(s.textureUploads).filter(([nodeId]) => !idSet.has(nodeId))),
            pinnedPreviewNodeIds: s.pinnedPreviewNodeIds.filter((nodeId) => !idSet.has(nodeId)),
          });
        }),
      removeEdge: (id) =>
        set((s) => {
          const graph = activeGraph(s);
          return withHistory(s, {
            ...patchActiveGraph(s, {
              edges: graph.edges.filter((e) => e.id !== id),
            }),
            selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
          });
        }),
      updateNodeData: (id, patch) =>
        set((s) => {
          const graph = activeGraph(s);
          const editedNode = graph.nodes.find((n) => n.id === id);
          if (!editedNode && s.nodes.some((node) => node.id === id)) {
            return withHistory(s, {
              nodes: s.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node),
            });
          }
          const linkedSourceNodeId = typeof editedNode?.data.linkedSourceNodeId === 'string' ? editedNode.data.linkedSourceNodeId : null;
          const linkedGroupSourceId = linkedSourceNodeId ?? id;
          const shouldUpdateLinkedGroup =
            !Object.prototype.hasOwnProperty.call(patch, 'linkedSourceNodeId') &&
            !Object.prototype.hasOwnProperty.call(patch, 'linkedSourceLabel');
          return withHistory(s, patchActiveGraph(s, {
            nodes: graph.nodes.map((n) => {
              const isEditedNode = n.id === id;
              const isLinkedGroupNode = shouldUpdateLinkedGroup &&
                (n.id === linkedGroupSourceId || n.data.linkedSourceNodeId === linkedGroupSourceId);
              if (!isEditedNode && !isLinkedGroupNode) return n;
              const nextData = { ...n.data, ...patch };
              if (shouldUpdateLinkedGroup && n.id !== linkedGroupSourceId && typeof patch.label === 'string') {
                nextData.linkedSourceLabel = patch.label;
              }
              return { ...n, data: nextData };
            }),
          }));
        }),
      unlinkNode: (id) =>
        set((s) => {
          const graph = activeGraph(s);
          let forkedSubgraphs: ShaderSubgraph[] = [];
          const activePatch = patchActiveGraph(s, {
            nodes: graph.nodes.map((node) => {
              if (node.id !== id) return node;
              const nextData = cloneShaderNodeData(node.data);
              if (nextData.nodeType === 'SubgraphInstance' && typeof nextData.subgraphId === 'string') {
                const sourceSubgraph = s.subgraphs.find((subgraph) => subgraph.id === nextData.subgraphId);
                if (sourceSubgraph) {
                  const fork = cloneSubgraphTree(sourceSubgraph, s.subgraphs, String(nextData.label || sourceSubgraph.name));
                  forkedSubgraphs = fork.subgraphs;
                  nextData.subgraphId = fork.root.id;
                  nextData.subgraphInputs = fork.root.inputs.map(clonePort);
                  nextData.subgraphOutputs = fork.root.outputs.map(clonePort);
                }
              }
              delete nextData.linkedSourceNodeId;
              delete nextData.linkedSourceLabel;
              return { ...node, data: nextData };
            }),
          });
          return withHistory(s, {
            ...activePatch,
            subgraphs: forkedSubgraphs.length > 0 ? [...activePatch.subgraphs, ...forkedSubgraphs] : activePatch.subgraphs,
          });
        }),
      selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
      focusRootNode: (selectedNodeId) => {
        const refocus = () =>
          set((s) =>
            s.activeSubgraphId === null && s.nodes.some((node) => node.id === selectedNodeId)
              ? { selectedNodeId, selectedEdgeId: null }
              : {},
          );
        set({
          activeSubgraphId: null,
          subgraphBreadcrumb: [],
          selectedNodeId,
          selectedEdgeId: null,
        });
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => window.requestAnimationFrame(refocus));
        } else {
          setTimeout(refocus, 0);
        }
      },
      selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
      enterSubgraph: (id) =>
        set((s) => ({
          activeSubgraphId: id,
          subgraphBreadcrumb: s.activeSubgraphId ? [...s.subgraphBreadcrumb, s.activeSubgraphId] : s.subgraphBreadcrumb,
          selectedNodeId: null,
          selectedEdgeId: null,
        })),
      exitSubgraph: () =>
        set((s) => {
          const parentId = s.subgraphBreadcrumb.at(-1) ?? null;
          return {
            activeSubgraphId: parentId,
            subgraphBreadcrumb: s.subgraphBreadcrumb.slice(0, -1),
            selectedNodeId: null,
            selectedEdgeId: null,
          };
        }),
      setShaderName: (shaderName) => set({ shaderName }),
      setPlaygroundTarget: (playgroundTarget) => set({ playgroundTarget }),
      setActiveTemplateInstanceId: (activeTemplateInstanceId) => set({ activeTemplateInstanceId }),
      setPreviewShape: (previewShape) => set({ previewShape }),
      setPreviewColor: (previewColor) => set({ previewColor }),
      setPreviewBaseTexture: (previewBaseTexture) => set({ previewBaseTexture }),
      setPreviewZoom: (previewZoom) => set({ previewZoom: Math.max(0.4, Math.min(2.5, previewZoom)) }),
      togglePinnedPreviewNode: (nodeId) =>
        set((s) => ({
          pinnedPreviewNodeIds: s.pinnedPreviewNodeIds.includes(nodeId)
            ? s.pinnedPreviewNodeIds.filter((id) => id !== nodeId)
            : [...s.pinnedPreviewNodeIds, nodeId],
        })),
      setTextureUpload: (nodeId, upload) =>
        set((s) => ({
          textureUploads: {
            ...s.textureUploads,
            [nodeId]: upload,
          },
        })),
      clearTextureUpload: (nodeId) =>
        set((s) => {
          const next = { ...s.textureUploads };
          delete next[nodeId];
          return { textureUploads: next };
        }),
      setLastGlsl: (lastGeneratedGlsl) => set({ lastGeneratedGlsl }),
      setValidationStatus: (validationStatus) => set({ validationStatus }),
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      setHasInitializedExample: (hasInitializedExample) => set({ hasInitializedExample }),
      markClean: () => set((s) => ({ cleanGraphHash: graphHash(s), undoStack: [], redoStack: [] })),
      isDirty: () => {
        const state = get();
        return graphHash(state) !== state.cleanGraphHash || state.undoStack.length > 0;
      },
      loadGraph: (graph) =>
        set(() => {
          const subgraphs = (graph.subgraphs ?? []).map(syncSubgraphBoundary);
          const next = {
            nodes: syncSubgraphInstances(graph.nodes, subgraphs),
            edges: graph.edges,
            subgraphs,
          };
          return {
            ...next,
            shaderName: graph.shaderName ?? get().shaderName,
            playgroundTarget: graph.playgroundTarget ?? null,
            activeTemplateInstanceId: graph.activeTemplateInstanceId ?? null,
            selectedNodeId: null,
            selectedEdgeId: null,
            activeSubgraphId: null,
            subgraphBreadcrumb: [],
            textureUploads: {},
            pinnedPreviewNodeIds: [],
            undoStack: [],
            redoStack: [],
            lastGeneratedGlsl: null,
            validationStatus: 'idle',
            validationErrors: {},
            hasInitializedExample: true,
            cleanGraphHash: graphHash(next),
          };
        }),
      undo: () =>
        set((s) => {
          const previous = s.undoStack.at(-1);
          if (!previous) return s;
          return {
            nodes: previous.nodes,
            edges: previous.edges,
            subgraphs: previous.subgraphs,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, snapshot(s)].slice(-HISTORY_LIMIT),
            selectedNodeId: null,
            selectedEdgeId: null,
            activeSubgraphId: null,
            subgraphBreadcrumb: [],
            activeTemplateInstanceId: s.activeTemplateInstanceId,
            lastGeneratedGlsl: null,
            validationStatus: 'idle',
            validationErrors: {},
          };
        }),
      redo: () =>
        set((s) => {
          const next = s.redoStack.at(-1);
          if (!next) return s;
          return {
            nodes: next.nodes,
            edges: next.edges,
            subgraphs: next.subgraphs,
            undoStack: [...s.undoStack, snapshot(s)].slice(-HISTORY_LIMIT),
            redoStack: s.redoStack.slice(0, -1),
            selectedNodeId: null,
            selectedEdgeId: null,
            activeSubgraphId: null,
            subgraphBreadcrumb: [],
            lastGeneratedGlsl: null,
            validationStatus: 'idle',
            validationErrors: {},
          };
        }),
      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,
    }),
    {
      name: 'feather-shader-graph',
      partialize: (s) => ({
        nodes: s.nodes,
        edges: s.edges,
        subgraphs: s.subgraphs,
        activeTemplateInstanceId: s.activeTemplateInstanceId,
        shaderName: s.shaderName,
        playgroundTarget: s.playgroundTarget,
        hasInitializedExample: s.hasInitializedExample,
        cleanGraphHash: s.cleanGraphHash,
      }),
    },
  ),
);
