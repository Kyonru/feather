import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShaderNodeData, NodeType } from '@/types/shader-graph';
import { useShaderGraphStore } from '@/store/shader-graph';
import { getNodeDef, NODE_DEFS } from './nodeDefs';
import { nodeTypes } from './nodes';
import { ArrowLeftIcon, CombineIcon, Redo2Icon, SearchIcon, Undo2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/use-theme';
import {
  addNodeAt,
  cloneGraphFragment,
  cloneShaderNodeData,
  defaultNodeData,
  inferSubgraphFromSelection,
  linkSuggestions,
  portRefs,
  type LinkSuggestion,
  type PortRef,
} from './graphUtils';

type ShaderClipboard = {
  type: 'feather.shader-graph-fragment';
  nodes: Node<ShaderNodeData>[];
  edges: Edge[];
};

let shaderClipboard: ShaderClipboard | null = null;

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

export function ShaderCanvas() {
  const nodes = useShaderGraphStore((s) => s.nodes);
  const edges = useShaderGraphStore((s) => s.edges);
  const subgraphs = useShaderGraphStore((s) => s.subgraphs);
  const activeSubgraphId = useShaderGraphStore((s) => s.activeSubgraphId);
  const setNodes = useShaderGraphStore((s) => s.setNodes);
  const setEdges = useShaderGraphStore((s) => s.setEdges);
  const addNode = useShaderGraphStore((s) => s.addNode);
  const addNodesAndEdges = useShaderGraphStore((s) => s.addNodesAndEdges);
  const replaceSelectionWithSubgraph = useShaderGraphStore((s) => s.replaceSelectionWithSubgraph);
  const removeNode = useShaderGraphStore((s) => s.removeNode);
  const removeEdge = useShaderGraphStore((s) => s.removeEdge);
  const unlinkNode = useShaderGraphStore((s) => s.unlinkNode);
  const selectNode = useShaderGraphStore((s) => s.selectNode);
  const selectEdge = useShaderGraphStore((s) => s.selectEdge);
  const selectedNodeId = useShaderGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useShaderGraphStore((s) => s.selectedEdgeId);
  const undo = useShaderGraphStore((s) => s.undo);
  const redo = useShaderGraphStore((s) => s.redo);
  const enterSubgraph = useShaderGraphStore((s) => s.enterSubgraph);
  const exitSubgraph = useShaderGraphStore((s) => s.exitSubgraph);
  const canUndo = useShaderGraphStore((s) => s.undoStack.length > 0);
  const canRedo = useShaderGraphStore((s) => s.redoStack.length > 0);
  const [nodePicker, setNodePicker] = useState<{ x: number; y: number; position: { x: number; y: number }; search: string } | null>(null);
  const [suggestionMenu, setSuggestionMenu] = useState<{ x: number; y: number; port: PortRef; items: LinkSuggestion[] } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [subgraphDialogOpen, setSubgraphDialogOpen] = useState(false);
  const [subgraphName, setSubgraphName] = useState('Subgraph');
  const pasteOffsetRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Captured via onInit — avoids calling useReactFlow() at the same level as <ReactFlow>
  const rfRef = useRef<ReactFlowInstance<Node<ShaderNodeData>> | null>(null);
  const activeSubgraph = activeSubgraphId ? subgraphs.find((subgraph) => subgraph.id === activeSubgraphId) : null;
  const graphNodes = activeSubgraph?.nodes ?? nodes;
  const graphEdges = activeSubgraph?.edges ?? edges;

  useEffect(() => {
    setSelectedNodeIds(new Set());
  }, [activeSubgraphId]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<ShaderNodeData>>[]) => {
      setNodes(applyNodeChanges(changes, graphNodes));
    },
    [graphNodes, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(applyEdgeChanges(changes, graphEdges));
    },
    [graphEdges, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(addEdge(connection, graphEdges));
    },
    [graphEdges, setEdges],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      selectNode(node.id);
      setSelectedNodeIds(new Set([node.id]));
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<ShaderNodeData>) => {
      if (node.data.nodeType !== 'SubgraphInstance' || !node.data.subgraphId) return;
      enterSubgraph(String(node.data.subgraphId));
      setSelectedNodeIds(new Set());
    },
    [enterSubgraph],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setSelectedNodeIds(new Set());
  }, [selectNode]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams<Node<ShaderNodeData>, Edge>) => {
      const nextIds = new Set(selectedNodes.map((node) => node.id));
      setSelectedNodeIds(nextIds);
      if (nextIds.size === 1) {
        selectNode(selectedNodes[0].id);
      } else if (nextIds.size === 0) {
        selectNode(null);
      }
    },
    [selectNode],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const sourceNode = graphNodes.find((n) => n.id === connection.source);
      const targetNode = graphNodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      const sourceDef = getNodeDef(sourceNode.data);
      const targetDef = getNodeDef(targetNode.data);
      if (!sourceDef || !targetDef) return false;
      const sourcePort = sourceDef.outputs.find((p) => p.id === connection.sourceHandle);
      const targetPort = targetDef.inputs.find((p) => p.id === connection.targetHandle);
      if (!sourcePort || !targetPort) return false;
      return sourcePort.type === targetPort.type;
    },
    [graphNodes],
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
      const id = `node-${Date.now()}-${Math.round(Math.random() * 100000)}`;

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

  const insertNode = useCallback(
    (nodeType: NodeType, position: { x: number; y: number }) => {
      const node = addNodeAt(nodeType, position);
      addNode(node);
      selectNode(node.id);
      setNodePicker(null);
      return node;
    },
    [addNode, selectNode],
  );

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      const rf = rfRef.current;
      const position = rf
        ? rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const x = cx + 256 > rect.width ? Math.max(0, cx - 256) : cx;
      const y = cy + 340 > rect.height ? Math.max(0, cy - 340) : cy;
      setSuggestionMenu(null);
      setNodePicker({ x, y, position, search: '' });
    };
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  const nodePickerItems = useMemo(() => {
    const query = nodePicker?.search.trim().toLowerCase() ?? '';
    return Object.entries(NODE_DEFS)
      .filter(([nodeType, def]) => nodeType !== 'SubgraphInstance' && (!query || def.label.toLowerCase().includes(query) || def.category.toLowerCase().includes(query)))
      .slice(0, 40) as Array<[NodeType, (typeof NODE_DEFS)[NodeType]]>;
  }, [nodePicker?.search]);

  const getSelectedIds = useCallback(() => {
    const selectedIds = new Set([...selectedNodeIds, ...graphNodes.filter((node) => node.selected).map((node) => node.id)]);
    if (selectedNodeId) selectedIds.add(selectedNodeId);
    return selectedIds;
  }, [graphNodes, selectedNodeId, selectedNodeIds]);

  const openSubgraphDialog = useCallback(() => {
    if (getSelectedIds().size < 2) {
      toast.info('Select at least two nodes to create a subgraph.');
      return;
    }
    setSubgraphName('Subgraph');
    setSubgraphDialogOpen(true);
  }, [getSelectedIds]);

  const createSubgraph = useCallback(() => {
    const name = subgraphName.trim();
    if (!name) return;
    const selectedIds = getSelectedIds();
    if (selectedIds.size < 2) return;
    const result = inferSubgraphFromSelection(graphNodes, graphEdges, selectedIds, name);
    if (!result) return;
    replaceSelectionWithSubgraph({
      subgraph: result.subgraph,
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId: result.instance.id,
    });
    setSelectedNodeIds(new Set([result.instance.id]));
    setSubgraphDialogOpen(false);
  }, [getSelectedIds, graphEdges, graphNodes, replaceSelectionWithSubgraph, subgraphName]);

  const selectedFragment = useCallback((): ShaderClipboard | null => {
    const selectedIds = getSelectedIds();
    if (selectedIds.size === 0) return null;
    const selectedNodes = graphNodes.filter((node) => selectedIds.has(node.id));
    if (selectedNodes.length === 0) return null;
    return {
      type: 'feather.shader-graph-fragment',
      nodes: selectedNodes.map((node) => ({ ...node, selected: false, data: cloneShaderNodeData(node.data) })),
      edges: graphEdges
        .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
        .map((edge) => ({ ...edge })),
    };
  }, [getSelectedIds, graphEdges, graphNodes]);

  const copySelection = useCallback(() => {
    const fragment = selectedFragment();
    if (!fragment) return;
    shaderClipboard = fragment;
    pasteOffsetRef.current = 0;
    void navigator.clipboard?.writeText(JSON.stringify(fragment)).catch(() => undefined);
    toast.success(fragment.nodes.length === 1 ? 'Copied node' : `Copied ${fragment.nodes.length} nodes`);
  }, [selectedFragment]);

  const pasteFragment = useCallback(
    (fragment: ShaderClipboard, duplicate = false) => {
      if (fragment.nodes.length === 0) return;
      const minX = Math.min(...fragment.nodes.map((node) => node.position.x));
      const minY = Math.min(...fragment.nodes.map((node) => node.position.y));
      const offset = duplicate ? 40 : 40 + pasteOffsetRef.current * 28;
      const rf = rfRef.current;
      const viewportCenter = rf
        ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: minX + offset, y: minY + offset };
      const position = duplicate ? { x: minX + offset, y: minY + offset } : viewportCenter;
      const cloned = cloneGraphFragment(fragment.nodes, fragment.edges, position);
      const pastedIds = new Set(cloned.nodes.map((node) => node.id));
      addNodesAndEdges(
        cloned.nodes.map((node, index) => {
          const source = fragment.nodes[index];
          return {
            ...node,
            selected: pastedIds.has(node.id),
            data: {
              ...node.data,
              linkedSourceNodeId: source?.data.linkedSourceNodeId ?? source?.id ?? null,
              linkedSourceLabel: source?.data.linkedSourceLabel ?? source?.data.label ?? null,
            },
          };
        }),
        cloned.edges,
        cloned.firstNodeId,
      );
      setSelectedNodeIds(pastedIds);
      if (!duplicate) pasteOffsetRef.current += 1;
    },
    [addNodesAndEdges],
  );

  const pasteSelection = useCallback(() => {
    const paste = (fragment: ShaderClipboard | null) => {
      if (!fragment) {
        toast.info('Copy a node first.');
        return;
      }
      pasteFragment(fragment);
    };

    if (shaderClipboard) {
      paste(shaderClipboard);
      return;
    }

    void navigator.clipboard?.readText()
      .then((text) => {
        const parsed = JSON.parse(text) as Partial<ShaderClipboard>;
        paste(parsed.type === 'feather.shader-graph-fragment' && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)
          ? { type: 'feather.shader-graph-fragment', nodes: parsed.nodes, edges: parsed.edges }
          : null);
      })
      .catch(() => paste(null));
  }, [pasteFragment]);

  const duplicateSelection = useCallback(() => {
    const fragment = selectedFragment();
    if (!fragment) return;
    pasteFragment(fragment, true);
  }, [pasteFragment, selectedFragment]);

  useEffect(() => {
    const onSuggest = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; portId: string; direction: 'input' | 'output'; x: number; y: number }>).detail;
      const port = portRefs(graphNodes, detail.direction).find((candidate) => candidate.nodeId === detail.nodeId && candidate.portId === detail.portId);
      if (!port) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      const cx = detail.x - (rect?.left ?? 0);
      const cy = detail.y - (rect?.top ?? 0);
      const cw = rect?.width ?? 9999;
      const ch = rect?.height ?? 9999;
      const x = cx + 288 > cw ? Math.max(0, cx - 288) : cx;
      const y = cy + 380 > ch ? Math.max(0, cy - 380) : cy;
      setNodePicker(null);
      setSuggestionMenu({ x, y, port, items: linkSuggestions(graphNodes, port) });
    };
    window.addEventListener('shader-graph:port-suggest', onSuggest);
    return () => window.removeEventListener('shader-graph:port-suggest', onSuggest);
  }, [graphNodes]);

  useEffect(() => {
    const onUnlink = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string }>).detail;
      if (!detail?.nodeId) return;
      const node = graphNodes.find((item) => item.id === detail.nodeId);
      if (!node?.data.linkedSourceNodeId) return;
      const confirmed = window.confirm('Unlink this node? It will become its own independent node.');
      if (!confirmed) return;
      unlinkNode(detail.nodeId);
      toast.success('Node unlinked');
    };
    window.addEventListener('shader-graph:unlink-node', onUnlink);
    return () => window.removeEventListener('shader-graph:unlink-node', onUnlink);
  }, [graphNodes, unlinkNode]);

  const applySuggestion = useCallback(
    (suggestion: LinkSuggestion) => {
      if (!suggestionMenu) return;
      const active = suggestionMenu.port;
      if (suggestion.kind === 'connect') {
        const source = active.direction === 'output' ? active : suggestion.target;
        const target = active.direction === 'input' ? active : suggestion.target;
        setEdges(addEdge({
          source: source.nodeId,
          sourceHandle: source.portId,
          target: target.nodeId,
          targetHandle: target.portId,
        }, graphEdges));
        setSuggestionMenu(null);
        return;
      }

      const rf = rfRef.current;
      const position = rf
        ? rf.screenToFlowPosition({ x: suggestionMenu.x + 36, y: suggestionMenu.y - 12 })
        : { x: suggestionMenu.x + 36, y: suggestionMenu.y - 12 };
      const def = NODE_DEFS[suggestion.nodeType];
      const bridge = {
        id: `node-${Date.now()}-${Math.round(Math.random() * 100000)}`,
        type: 'shaderNode',
        position,
        data: defaultNodeData(suggestion.nodeType, def.label),
      };
      const input = def.inputs.find((port) => port.type === active.type) ?? def.inputs[0];
      const output = def.outputs.find((port) => port.type === active.type) ?? def.outputs[0];
      const nextEdges = [...graphEdges];
      if (active.direction === 'output' && input) {
        nextEdges.push({
          id: `${active.nodeId}:${active.portId}->${bridge.id}:${input.id}`,
          source: active.nodeId,
          sourceHandle: active.portId,
          target: bridge.id,
          targetHandle: input.id,
        });
      } else if (active.direction === 'input' && output) {
        nextEdges.push({
          id: `${bridge.id}:${output.id}->${active.nodeId}:${active.portId}`,
          source: bridge.id,
          sourceHandle: output.id,
          target: active.nodeId,
          targetHandle: active.portId,
        });
      }
      addNodesAndEdges([bridge], nextEdges.filter((edge) => !graphEdges.some((existing) => existing.id === edge.id)), bridge.id);
      setSuggestionMenu(null);
    },
    [addNodesAndEdges, graphEdges, setEdges, suggestionMenu],
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
      if (modifier && key === 'c') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (modifier && key === 'v') {
        e.preventDefault();
        pasteSelection();
        return;
      }
      if (modifier && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selectedNodeId) removeNode(selectedNodeId);
      else if (selectedEdgeId) removeEdge(selectedEdgeId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelection, duplicateSelection, pasteSelection, selectedNodeId, selectedEdgeId, removeNode, removeEdge, redo, undo]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const theme = useTheme();

  return (
    <div
      ref={wrapperRef}
      data-testid="shader-canvas"
      className="relative h-full w-full"
      style={{ height: '100%', width: '100%' }}
      onDrop={onDrop}
      onDragOver={onDragOver}

      onClick={() => {
        setNodePicker(null);
        setSuggestionMenu(null);
      }}
    >
      <ReactFlow
        key={activeSubgraphId ?? 'root'}
        nodes={graphNodes}
        edges={graphEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        proOptions={{ hideAttribution: true }}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        selectionOnDrag
        panOnDrag={[1, 2]}
        colorMode={theme}
      >
        <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-md border bg-card/95 p-1 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={!activeSubgraph}
            aria-label="Back to parent graph"
            title="Back to parent graph"
            onClick={exitSubgraph}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          {activeSubgraph && (
            <div className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground">
              {activeSubgraph.name}
            </div>
          )}
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
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Create subgraph from selection"
            title="Create subgraph from selection"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              openSubgraphDialog();
            }}
          >
            <CombineIcon className="size-4" />
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
      {nodePicker && (
        <div
          data-testid="shader-node-picker"
          className="absolute z-50 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          style={{ left: nodePicker.x, top: nodePicker.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center gap-2 rounded border bg-background px-2">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <Input
              autoFocus
              className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
              placeholder="Search nodes"
              value={nodePicker.search}
              onChange={(event) => setNodePicker({ ...nodePicker, search: event.target.value })}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {nodePickerItems.map(([nodeType, def]) => (
              <button
                key={nodeType}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => insertNode(nodeType, nodePicker.position)}
              >
                <span>{def.label}</span>
                <span className="text-[10px] text-muted-foreground">{def.category}</span>
              </button>
            ))}
            {nodePickerItems.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No nodes found</div>
            )}
          </div>
        </div>
      )}
      {suggestionMenu && (
        <div
          data-testid="shader-link-suggestions"
          className="absolute z-50 w-72 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          style={{ left: suggestionMenu.x, top: suggestionMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggestions for {suggestionMenu.port.nodeLabel} · {suggestionMenu.port.portLabel}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {suggestionMenu.items.map((item, index) => (
              <button
                key={`${item.kind}-${item.label}-${index}`}
                type="button"
                className="grid w-full gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => applySuggestion(item)}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {item.kind === 'connect' ? 'Connect directly' : item.kind === 'recipe' ? 'Insert recipe bridge' : 'Insert helper node'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Dialog open={subgraphDialogOpen} onOpenChange={setSubgraphDialogOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Create Subgraph</DialogTitle>
            <DialogDescription>Name the reusable graph block created from the selected nodes.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createSubgraph();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="shader-subgraph-name">Name</Label>
              <Input
                id="shader-subgraph-name"
                autoFocus
                value={subgraphName}
                onChange={(event) => setSubgraphName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubgraphDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!subgraphName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
