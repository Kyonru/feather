import type { Node, Edge } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShaderNodeData, PlaygroundTarget, GeneratedGlsl, ShaderTextureUpload, ShaderSubgraph } from '@/types/shader-graph';

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
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
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
  removeEdge: (id: string) => void;
  updateNodeData: (id: string, patch: Partial<ShaderNodeData>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  enterSubgraph: (id: string) => void;
  exitSubgraph: () => void;
  setShaderName: (name: string) => void;
  setPlaygroundTarget: (target: PlaygroundTarget | null) => void;
  setTextureUpload: (nodeId: string, upload: ShaderTextureUpload) => void;
  clearTextureUpload: (nodeId: string) => void;
  setLastGlsl: (glsl: GeneratedGlsl | null) => void;
  setValidationStatus: (status: ValidationStatus) => void;
  setValidationErrors: (errors: ShaderGraphStore['validationErrors']) => void;
  setHasInitializedExample: (hasInitializedExample: boolean) => void;
  markClean: () => void;
  isDirty: () => boolean;
  loadGraph: (graph: { nodes: Node<ShaderNodeData>[]; edges: Edge[]; subgraphs?: ShaderSubgraph[]; shaderName?: string; playgroundTarget?: PlaygroundTarget | null }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const HISTORY_LIMIT = 100;

function graphHash(state: Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs'>): string {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, subgraphs: state.subgraphs });
}

function snapshot(state: Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs'>): GraphSnapshot {
  return { nodes: state.nodes, edges: state.edges, subgraphs: state.subgraphs };
}

function sameGraph(a: GraphSnapshot, b: GraphSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
    return {
      nodes: graph.nodes ?? state.nodes,
      edges: graph.edges ?? state.edges,
      subgraphs: state.subgraphs,
    };
  }

  return {
    nodes: state.nodes,
    edges: state.edges,
    subgraphs: state.subgraphs.map((subgraph) =>
      subgraph.id === state.activeSubgraphId
        ? {
          ...subgraph,
          nodes: graph.nodes ?? subgraph.nodes,
          edges: graph.edges ?? subgraph.edges,
        }
        : subgraph,
    ),
  };
}

function withHistory(
  state: ShaderGraphStore,
  patch: Partial<Pick<ShaderGraphStore, 'nodes' | 'edges' | 'subgraphs' | 'selectedNodeId' | 'selectedEdgeId' | 'textureUploads'>>,
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
      shaderName: 'my-shader',
      playgroundTarget: null,
      textureUploads: {},
      lastGeneratedGlsl: null,
      validationStatus: 'idle',
      validationErrors: {},
      hasInitializedExample: false,
      cleanGraphHash: graphHash({ nodes: [], edges: [], subgraphs: [] }),

      setNodes: (nodes) => set((s) => withHistory(s, patchActiveGraph(s, { nodes }))),
      setEdges: (edges) => set((s) => withHistory(s, patchActiveGraph(s, { edges }))),
      setSubgraphs: (subgraphs) => set((s) => withHistory(s, { subgraphs })),
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
              nodes: [...graph.nodes, ...newNodes],
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
            textureUploads: Object.fromEntries(Object.entries(s.textureUploads).filter(([nodeId]) => nodeId !== id)),
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
          return withHistory(s, patchActiveGraph(s, {
            nodes: graph.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
          }));
        }),
      selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
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
          const next = {
            nodes: graph.nodes,
            edges: graph.edges,
            subgraphs: graph.subgraphs ?? [],
          };
          return {
            ...next,
            shaderName: graph.shaderName ?? get().shaderName,
            playgroundTarget: graph.playgroundTarget ?? null,
            selectedNodeId: null,
            selectedEdgeId: null,
            activeSubgraphId: null,
            subgraphBreadcrumb: [],
            textureUploads: {},
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
        shaderName: s.shaderName,
        playgroundTarget: s.playgroundTarget,
        hasInitializedExample: s.hasInitializedExample,
        cleanGraphHash: s.cleanGraphHash,
      }),
    },
  ),
);
