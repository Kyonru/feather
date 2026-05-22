import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import type { ShaderNodeData, NodeType } from '@/types/shader-graph';
import { useShaderGraphStore } from '@/store/shader-graph';
import { getNodeDef, NODE_DEFS } from './nodeDefs';
import { nodeTypes } from './nodes';
import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { DEFAULT_CUSTOM_FUNCTION_CODE } from './customNode';
import { useTheme } from '@/hooks/use-theme';

// Hex equivalents of the Tailwind *-500 colors used in CATEGORY_COLORS
const CATEGORY_HEX: Record<string, string> = {
  Custom: '#71717a',
  Input: '#3b82f6',
  Math: '#f97316',
  Complex: '#f59e0b',
  Quaternion: '#d946ef',
  Symmetry: '#8b5cf6',
  Random: '#78716c',
  Vector: '#a855f7',
  Color: '#ec4899',
  Composite: '#f43f5e',
  Noise: '#22c55e',
  Pattern: '#10b981',
  Halftone: '#84cc16',
  'Pixel Perfect': '#0ea5e9',
  UV: '#6366f1',
  Effect: '#06b6d4',
  Output: '#ef4444',
  Vertex: '#eab308',
  SDF: '#14b8a6',
};

function miniMapNodeColor(node: Node<ShaderNodeData>): string {
  const def = getNodeDef(node.data);
  return CATEGORY_HEX[def?.category ?? ''] ?? '#71717a';
}

let idCounter = Date.now();
function nextId() {
  return `node-${++idCounter}`;
}

function defaultNodeData(nodeType: NodeType, label: string): ShaderNodeData {
  if (nodeType === 'CustomFunction') {
    return {
      label,
      nodeType,
      customCode: DEFAULT_CUSTOM_FUNCTION_CODE,
    };
  }
  return { label, nodeType };
}

export function ShaderCanvas() {
  const nodes = useShaderGraphStore((s) => s.nodes);
  const edges = useShaderGraphStore((s) => s.edges);
  const setNodes = useShaderGraphStore((s) => s.setNodes);
  const setEdges = useShaderGraphStore((s) => s.setEdges);
  const addNode = useShaderGraphStore((s) => s.addNode);
  const removeNode = useShaderGraphStore((s) => s.removeNode);
  const removeEdge = useShaderGraphStore((s) => s.removeEdge);
  const selectNode = useShaderGraphStore((s) => s.selectNode);
  const selectEdge = useShaderGraphStore((s) => s.selectEdge);
  const selectedNodeId = useShaderGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useShaderGraphStore((s) => s.selectedEdgeId);
  const undo = useShaderGraphStore((s) => s.undo);
  const redo = useShaderGraphStore((s) => s.redo);
  const canUndo = useShaderGraphStore((s) => s.undoStack.length > 0);
  const canRedo = useShaderGraphStore((s) => s.redoStack.length > 0);

  // Captured via onInit — avoids calling useReactFlow() at the same level as <ReactFlow>
  const rfRef = useRef<ReactFlowInstance<Node<ShaderNodeData>> | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<ShaderNodeData>>[]) => {
      setNodes(applyNodeChanges(changes, nodes));
    },
    [nodes, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(applyEdgeChanges(changes, edges));
    },
    [edges, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(addEdge(connection, edges));
    },
    [edges, setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      const sourceDef = getNodeDef(sourceNode.data);
      const targetDef = getNodeDef(targetNode.data);
      if (!sourceDef || !targetDef) return false;
      const sourcePort = sourceDef.outputs.find((p) => p.id === connection.sourceHandle);
      const targetPort = targetDef.inputs.find((p) => p.id === connection.targetHandle);
      if (!sourcePort || !targetPort) return false;
      return sourcePort.type === targetPort.type;
    },
    [nodes],
  );

  // Drop handler lives on the wrapper div so it fires regardless of ReactFlow internals
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/shader-node-type') as NodeType;
      if (!nodeType || !NODE_DEFS[nodeType]) return;

      const rf = rfRef.current;
      const position = rf
        ? rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        : { x: event.clientX, y: event.clientY };

      const def = NODE_DEFS[nodeType];
      const id = nextId();

      addNode({
        id,
        type: 'shaderNode',
        position,
        data: defaultNodeData(nodeType, def.label),
      });
      selectNode(id);
    },
    [addNode, selectNode],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      const modifier = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (modifier && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selectedNodeId) removeNode(selectedNodeId);
      else if (selectedEdgeId) removeEdge(selectedEdgeId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, selectedEdgeId, removeNode, removeEdge, redo, undo]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const theme = useTheme();

  return (
    <div className="h-full w-full" style={{ height: '100%', width: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        proOptions={{ hideAttribution: true }}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        colorMode={theme}
      >
        <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-md border bg-card/95 p-1 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={!canUndo}
            title="Undo (Cmd/Ctrl+Z)"
            onClick={undo}
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={!canRedo}
            title="Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)"
            onClick={redo}
          >
            <Redo2Icon className="size-4" />
          </Button>
        </div>
        <Background gap={20} size={1} className="text-muted-foreground/20!" />
        <Controls className="[&>button]:bg-card [&>button]:border-border [&>button]:text-background" />
        <MiniMap
          zoomable
          pannable
          nodeStrokeWidth={3}
          className="bg-card! border! border-border!"
          nodeColor={miniMapNodeColor}
        />
      </ReactFlow>
    </div>
  );
}
