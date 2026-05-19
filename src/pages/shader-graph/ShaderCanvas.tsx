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
import type { ShaderNodeData, NodeType } from '@/types/shader-graph';
import { useShaderGraphStore } from '@/store/shader-graph';
import { NODE_DEFS } from './nodeDefs';
import { nodeTypes } from './nodes';

let idCounter = Date.now();
function nextId() {
  return `node-${++idCounter}`;
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
      const sourceDef = NODE_DEFS[sourceNode.data.nodeType as NodeType];
      const targetDef = NODE_DEFS[targetNode.data.nodeType as NodeType];
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
        data: { label: def.label, nodeType },
      });
      selectNode(id);
    },
    [addNode, selectNode],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (selectedNodeId) removeNode(selectedNodeId);
      else if (selectedEdgeId) removeEdge(selectedEdgeId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, selectedEdgeId, removeNode, removeEdge]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

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
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        className="bg-background"
      >
        <Background gap={20} size={1} className="!text-muted-foreground/20" />
        <Controls className="[&>button]:bg-card [&>button]:border-border [&>button]:text-foreground" />
        <MiniMap className="!bg-card !border !border-border" nodeColor="hsl(var(--muted))" />
      </ReactFlow>
    </div>
  );
}
