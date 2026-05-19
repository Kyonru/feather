import type { Node, Edge } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShaderNodeData, PlaygroundTarget, GeneratedGlsl } from '@/types/shader-graph';

type ValidationStatus = 'idle' | 'validating' | 'ok' | 'error';

type GraphSnapshot = {
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
};

type ShaderGraphStore = {
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
  undoStack: GraphSnapshot[];
  redoStack: GraphSnapshot[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  lastGeneratedGlsl: GeneratedGlsl | null;
  validationStatus: ValidationStatus;
  validationErrors: { pixelError?: string; vertexError?: string };

  setNodes: (nodes: Node<ShaderNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node<ShaderNodeData>) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  updateNodeData: (id: string, patch: Partial<ShaderNodeData>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setShaderName: (name: string) => void;
  setPlaygroundTarget: (target: PlaygroundTarget | null) => void;
  setLastGlsl: (glsl: GeneratedGlsl | null) => void;
  setValidationStatus: (status: ValidationStatus) => void;
  setValidationErrors: (errors: ShaderGraphStore['validationErrors']) => void;
  loadGraph: (graph: { nodes: Node<ShaderNodeData>[]; edges: Edge[]; shaderName?: string; playgroundTarget?: PlaygroundTarget | null }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const HISTORY_LIMIT = 100;

function snapshot(state: Pick<ShaderGraphStore, 'nodes' | 'edges'>): GraphSnapshot {
  return { nodes: state.nodes, edges: state.edges };
}

function sameGraph(a: GraphSnapshot, b: GraphSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withHistory(
  state: ShaderGraphStore,
  patch: Partial<Pick<ShaderGraphStore, 'nodes' | 'edges' | 'selectedNodeId' | 'selectedEdgeId'>>,
) {
  const before = snapshot(state);
  const after = {
    nodes: patch.nodes ?? state.nodes,
    edges: patch.edges ?? state.edges,
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
      undoStack: [],
      redoStack: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      shaderName: 'my-shader',
      playgroundTarget: null,
      lastGeneratedGlsl: null,
      validationStatus: 'idle',
      validationErrors: {},

      setNodes: (nodes) => set((s) => withHistory(s, { nodes })),
      setEdges: (edges) => set((s) => withHistory(s, { edges })),
      addNode: (node) => set((s) => withHistory(s, { nodes: [...s.nodes, node] })),
      removeNode: (id) =>
        set((s) =>
          withHistory(s, {
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
          }),
        ),
      removeEdge: (id) =>
        set((s) =>
          withHistory(s, {
            edges: s.edges.filter((e) => e.id !== id),
            selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
          }),
        ),
      updateNodeData: (id, patch) =>
        set((s) =>
          withHistory(s, {
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
          }),
        ),
      selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
      selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
      setShaderName: (shaderName) => set({ shaderName }),
      setPlaygroundTarget: (playgroundTarget) => set({ playgroundTarget }),
      setLastGlsl: (lastGeneratedGlsl) => set({ lastGeneratedGlsl }),
      setValidationStatus: (validationStatus) => set({ validationStatus }),
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      loadGraph: (graph) =>
        set({
          nodes: graph.nodes,
          edges: graph.edges,
          shaderName: graph.shaderName ?? get().shaderName,
          playgroundTarget: graph.playgroundTarget ?? null,
          selectedNodeId: null,
          selectedEdgeId: null,
          undoStack: [],
          redoStack: [],
          lastGeneratedGlsl: null,
          validationStatus: 'idle',
          validationErrors: {},
        }),
      undo: () =>
        set((s) => {
          const previous = s.undoStack.at(-1);
          if (!previous) return s;
          return {
            nodes: previous.nodes,
            edges: previous.edges,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, snapshot(s)].slice(-HISTORY_LIMIT),
            selectedNodeId: null,
            selectedEdgeId: null,
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
            undoStack: [...s.undoStack, snapshot(s)].slice(-HISTORY_LIMIT),
            redoStack: s.redoStack.slice(0, -1),
            selectedNodeId: null,
            selectedEdgeId: null,
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
        shaderName: s.shaderName,
        playgroundTarget: s.playgroundTarget,
      }),
    },
  ),
);
