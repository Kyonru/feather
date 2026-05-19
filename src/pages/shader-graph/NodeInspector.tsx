import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShaderGraphStore } from '@/store/shader-graph';
import { NODE_DEFS } from './nodeDefs';
import type { NodeType } from '@/types/shader-graph';
import { Trash2Icon } from 'lucide-react';

export function NodeInspector() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    updateNodeData,
    setShaderName,
    shaderName,
    removeNode,
    removeEdge,
  } = useShaderGraphStore();

  const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const def = selected ? NODE_DEFS[selected.data.nodeType as NodeType] : null;
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="grid gap-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Shader Name</Label>
        <Input
          className="h-7 text-xs font-mono"
          value={shaderName}
          onChange={(e) => setShaderName(e.target.value)}
        />
      </div>

      {selected && def && (
        <div className="border-t pt-3 grid gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                {def.category}
              </div>
              <div className="font-semibold">{selected.data.label || def.label}</div>
              <div className="text-[10px] text-muted-foreground">{def.label}</div>
            </div>
            <button
              onClick={() => removeNode(selected.id)}
              className="flex items-center justify-center size-6 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-0.5"
              title="Delete node (Del)"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>

          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Node Name</Label>
            <Input
              className="h-7 text-xs"
              value={selected.data.label ?? def.label}
              placeholder={def.label}
              onChange={(e) => updateNodeData(selected.id, { label: e.target.value })}
              onBlur={(e) => {
                if (e.target.value.trim().length === 0) {
                  updateNodeData(selected.id, { label: def.label });
                }
              }}
            />
          </div>

          {selected.data.nodeType === 'FloatConstant' && (
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">Value</Label>
              <Input
                className="h-7 text-xs"
                type="number"
                step={0.01}
                value={(selected.data.values?.val as number) ?? 0}
                onChange={(e) =>
                  updateNodeData(selected.id, {
                    values: { ...selected.data.values, val: parseFloat(e.target.value) },
                  })
                }
              />
            </div>
          )}

          {selected.data.nodeType === 'Vec2Constant' && (
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">X / Y</Label>
              <div className="flex gap-1">
                {[0, 1].map((idx) => (
                  <Input
                    key={idx}
                    className="h-7 text-xs"
                    type="number"
                    step={0.01}
                    value={((selected.data.values?.val as number[]) ?? [0, 0])[idx]}
                    onChange={(e) => {
                      const prev = (selected.data.values?.val as number[]) ?? [0, 0];
                      const next = [...prev] as [number, number];
                      next[idx] = parseFloat(e.target.value);
                      updateNodeData(selected.id, { values: { ...selected.data.values, val: next } });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {selected.data.nodeType === 'Vec3Constant' && (
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">X / Y / Z</Label>
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((idx) => (
                  <Input
                    key={idx}
                    className="h-7 text-xs"
                    type="number"
                    step={0.01}
                    value={((selected.data.values?.val as number[]) ?? [0, 0, 0])[idx]}
                    onChange={(e) => {
                      const prev = (selected.data.values?.val as number[]) ?? [0, 0, 0];
                      const next = [...prev] as [number, number, number];
                      next[idx] = parseFloat(e.target.value);
                      updateNodeData(selected.id, { values: { ...selected.data.values, val: next } });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {selected.data.nodeType === 'Vec4Constant' && (
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">R / G / B / A</Label>
              <div className="grid grid-cols-2 gap-1">
                {[0, 1, 2, 3].map((idx) => (
                  <Input
                    key={idx}
                    className="h-7 text-xs"
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    value={((selected.data.values?.val as number[]) ?? [0, 0, 0, 1])[idx]}
                    onChange={(e) => {
                      const prev = (selected.data.values?.val as number[]) ?? [0, 0, 0, 1];
                      const next = [...prev] as [number, number, number, number];
                      next[idx] = parseFloat(e.target.value);
                      updateNodeData(selected.id, { values: { ...selected.data.values, val: next } });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {def.inputs.length > 0 && (
            <div className="grid gap-0.5">
              <div className="text-[10px] text-muted-foreground font-medium mb-0.5">Inputs</div>
              {def.inputs.map((port) => (
                <div key={port.id} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{port.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">{port.type}</span>
                </div>
              ))}
            </div>
          )}
          {def.outputs.length > 0 && (
            <div className="grid gap-0.5">
              <div className="text-[10px] text-muted-foreground font-medium mb-0.5">Outputs</div>
              {def.outputs.map((port) => (
                <div key={port.id} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{port.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">{port.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedEdge && !selected && (
        <div className="border-t pt-3 grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                Edge
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {selectedEdge.source} → {selectedEdge.target}
              </div>
            </div>
            <button
              onClick={() => removeEdge(selectedEdge.id)}
              className="flex items-center justify-center size-6 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
              title="Delete edge (Del)"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {!selected && !selectedEdge && (
        <p className="text-[10px] text-muted-foreground">
          Select a node or edge to inspect it.
        </p>
      )}
    </div>
  );
}
