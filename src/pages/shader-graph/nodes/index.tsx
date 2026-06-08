import { Fragment } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { EyeIcon, LinkIcon } from 'lucide-react';
import { cn } from '@/utils/styles';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { ShaderNodeData } from '@/types/shader-graph';
import { getNodeDef, CATEGORY_COLORS, PORT_TYPE_COLORS } from '../nodeDefs';
import { LoveNodePreview } from '../LoveNodePreview';

const ROW_H = 20;

export function ShaderNode({ id, data, selected }: NodeProps<Node<ShaderNodeData>>) {
  const selectedNodeId = useShaderGraphStore((s) => s.selectedNodeId);
  const pinnedPreviewNodeIds = useShaderGraphStore((s) => s.pinnedPreviewNodeIds);
  const def = getNodeDef(data);
  if (!def) return null;
  const pinnedPreview = data.nodeType === 'Preview' && pinnedPreviewNodeIds.includes(id);
  const activePreview = data.nodeType === 'Preview' && (selectedNodeId === id || pinnedPreview);
  const colorClass = CATEGORY_COLORS[def.category] ?? 'border-l-gray-500';
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const dropAnimating = Boolean(data.__dropAnimating);

  return (
    <div
      className={cn(
        'relative min-w-28 rounded border border-l-2 bg-card px-3 py-2 shadow-sm',
        colorClass,
        dropAnimating && 'shader-node-drop-enter',
        selected && 'ring-2 ring-primary',
      )}
    >
      {data.linkedSourceNodeId && (
        <button
          type="button"
          aria-label="Unlink linked node"
          title={`Linked to ${data.linkedSourceLabel ?? 'copied node'}. Click to unlink.`}
          className="nodrag nopan absolute right-1 top-1 flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(new CustomEvent('shader-graph:unlink-node', {
              detail: { nodeId: id },
            }));
          }}
        >
          <LinkIcon className="size-3" />
        </button>
      )}
      <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {def.category}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 truncate text-xs font-semibold">{data.label}</div>
        {data.nodeType === 'Preview' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1 py-0.5 text-[9px] font-medium text-violet-700 dark:text-violet-300">
            <EyeIcon className="size-2.5" />
            Probe
          </span>
        )}
      </div>

      {/* Handles must be direct children of this .relative div so they position relative to it */}
      <div className="relative mt-2" style={{ minHeight: rows * ROW_H }}>
        {def.inputs.map((port, i) => (
          <Fragment key={port.id}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              onClick={(event) => {
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('shader-graph:port-suggest', {
                  detail: {
                    nodeId: id,
                    portId: port.id,
                    direction: 'input',
                    x: event.clientX,
                    y: event.clientY,
                  },
                }));
              }}
              style={{
                top: i * ROW_H + ROW_H / 2,
                left: -12,
                backgroundColor: PORT_TYPE_COLORS[port.type],
                borderColor: PORT_TYPE_COLORS[port.type],
              }}
              className="size-2.5! border-2!"
            />
            <div
              style={{ position: 'absolute', top: i * ROW_H, left: 0, height: ROW_H }}
              className="flex items-center"
            >
              <span className="text-[9px] text-muted-foreground">{port.label}</span>
            </div>
          </Fragment>
        ))}
        {def.outputs.map((port, i) => (
          <Fragment key={port.id}>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              onClick={(event) => {
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('shader-graph:port-suggest', {
                  detail: {
                    nodeId: id,
                    portId: port.id,
                    direction: 'output',
                    x: event.clientX,
                    y: event.clientY,
                  },
                }));
              }}
              style={{
                top: i * ROW_H + ROW_H / 2,
                right: -12,
                backgroundColor: PORT_TYPE_COLORS[port.type],
                borderColor: PORT_TYPE_COLORS[port.type],
              }}
              className="size-2.5! border-2!"
            />
            <div
              style={{ position: 'absolute', top: i * ROW_H, right: 0, height: ROW_H }}
              className="flex items-center justify-end"
            >
              <span className="text-[9px] text-muted-foreground">{port.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
      {data.nodeType === 'Preview' && <LoveNodePreview nodeId={id} active={activePreview} pinned={pinnedPreview} />}
    </div>
  );
}

export const nodeTypes = {
  shaderNode: ShaderNode,
} as const;
