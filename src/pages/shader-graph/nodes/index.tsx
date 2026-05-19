import { Fragment } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@/utils/styles';
import type { ShaderNodeData, NodeType } from '@/types/shader-graph';
import { NODE_DEFS, CATEGORY_COLORS, PORT_TYPE_COLORS } from '../nodeDefs';

const ROW_H = 20;

export function ShaderNode({ data, selected }: NodeProps<Node<ShaderNodeData>>) {
  const def = NODE_DEFS[data.nodeType as NodeType];
  if (!def) return null;
  const colorClass = CATEGORY_COLORS[def.category] ?? 'border-l-gray-500';
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);

  return (
    <div
      className={cn(
        'min-w-28 rounded border border-l-2 bg-card px-3 py-2 shadow-sm',
        colorClass,
        selected && 'ring-2 ring-primary',
      )}
    >
      <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {def.category}
      </div>
      <div className="text-xs font-semibold">{data.label}</div>

      {/* Handles must be direct children of this .relative div so they position relative to it */}
      <div className="relative mt-2" style={{ minHeight: rows * ROW_H }}>
        {def.inputs.map((port, i) => (
          <Fragment key={port.id}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
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
    </div>
  );
}

export const nodeTypes = {
  shaderNode: ShaderNode,
} as const;
