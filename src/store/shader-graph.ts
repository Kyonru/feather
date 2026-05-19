import type { Node, Edge } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShaderNodeData, PlaygroundTarget, GeneratedGlsl } from '@/types/shader-graph';

type ValidationStatus = 'idle' | 'validating' | 'ok' | 'error';

type ShaderGraphStore = {
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
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
};

export const useShaderGraphStore = create<ShaderGraphStore>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      shaderName: 'my-shader',
      playgroundTarget: null,
      lastGeneratedGlsl: null,
      validationStatus: 'idle',
      validationErrors: {},

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
      removeNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        })),
      removeEdge: (id) =>
        set((s) => ({
          edges: s.edges.filter((e) => e.id !== id),
          selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
        })),
      updateNodeData: (id, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
          ),
        })),
      selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
      selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
      setShaderName: (shaderName) => set({ shaderName }),
      setPlaygroundTarget: (playgroundTarget) => set({ playgroundTarget }),
      setLastGlsl: (lastGeneratedGlsl) => set({ lastGeneratedGlsl }),
      setValidationStatus: (validationStatus) => set({ validationStatus }),
      setValidationErrors: (validationErrors) => set({ validationErrors }),
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
