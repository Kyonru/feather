import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useShaderGraphStore } from '@/store/shader-graph';
import { NODE_DEFS } from './nodeDefs';
import type { NodeType, PortDef } from '@/types/shader-graph';
import { FolderOpenIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { shaderTextureUniformName } from './glslUtils';
import { pickShaderTexture } from './textureUpload';
import { toast } from 'sonner';

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function vec4Value(value: unknown): [number, number, number, number] {
  const raw = Array.isArray(value) ? value : [0, 0, 0, 1];
  return [
    clamp01(Number(raw[0] ?? 0)),
    clamp01(Number(raw[1] ?? 0)),
    clamp01(Number(raw[2] ?? 0)),
    clamp01(Number(raw[3] ?? 1)),
  ];
}

function vec4ToHex(value: [number, number, number, number]) {
  const part = (channel: number) =>
    Math.round(clamp01(channel) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(value[0])}${part(value[1])}${part(value[2])}`;
}

function hexToRgb(value: string) {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255] as const;
}

function defaultPortValue(port: PortDef): number | number[] {
  if (port.defaultValue !== undefined) return port.defaultValue;
  if (port.type === 'vec2') return [0, 0];
  if (port.type === 'vec3') return [0, 0, 0];
  if (port.type === 'vec4') return [0, 0, 0, 1];
  return 0;
}

function clampValue(value: number, port: PortDef): number {
  if (!Number.isFinite(value)) return 0;
  if (port.min !== undefined && value < port.min) return port.min;
  if (port.max !== undefined && value > port.max) return port.max;
  return value;
}

function finiteValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalFiniteValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function portStep(port: PortDef): number {
  return port.step ?? 0.01;
}

export function NodeInspector() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    textureUploads,
    updateNodeData,
    setTextureUpload,
    clearTextureUpload,
    setShaderName,
    shaderName,
    removeNode,
    removeEdge,
  } = useShaderGraphStore();
  const [vec4EditMode, setVec4EditMode] = useState<'vector' | 'color'>('vector');

  const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const def = selected ? NODE_DEFS[selected.data.nodeType as NodeType] : null;
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;
  const selectedVec4 = selected ? vec4Value(selected.data.values?.val) : [0, 0, 0, 1] as [number, number, number, number];
  const selectedTextureUpload = selected ? textureUploads[selected.id] : null;

  function updateSelectedVec4(next: [number, number, number, number]) {
    if (!selected) return;
    updateNodeData(selected.id, { values: { ...selected.data.values, val: next } });
  }

  function updateSelectedInput(port: PortDef, next: number | number[]) {
    if (!selected) return;
    updateNodeData(selected.id, { values: { ...selected.data.values, [port.id]: next } });
  }

  async function uploadSelectedTexture() {
    if (!selected) return;
    const texture = await pickShaderTexture();
    if (!texture) return;
    setTextureUpload(selected.id, texture);
    toast.success(`${selected.data.label || 'Texture'} loaded: ${texture.filename}`);
  }

  function renderPortValueEditor(port: PortDef) {
    if (!selected) return null;

    const rawValue = selected.data.values?.[port.id] ?? defaultPortValue(port);
    const inputProps = {
      min: port.min,
      max: port.max,
      step: portStep(port),
    };

    if (port.type === 'float') {
      return (
        <Input
          className="h-7 text-xs"
          type="number"
          {...inputProps}
          value={finiteValue(rawValue)}
          onChange={(e) => updateSelectedInput(port, clampValue(parseFloat(e.target.value), port))}
        />
      );
    }

    if (port.type === 'image') {
      return (
        <p className="text-[10px] text-muted-foreground">
          Uses the main sprite texture unless a texture input is connected.
        </p>
      );
    }

    if (port.type === 'vec2' || port.type === 'vec3' || port.type === 'vec4') {
      const count = port.type === 'vec2' ? 2 : port.type === 'vec3' ? 3 : 4;
      const fallback = defaultPortValue(port) as number[];
      const value = Array.isArray(rawValue) ? rawValue : fallback;
      const gridClass = count === 2 ? 'grid grid-cols-2 gap-1' : count === 3 ? 'grid grid-cols-3 gap-1' : 'grid grid-cols-2 gap-1';
      return (
        <div className={gridClass}>
          {Array.from({ length: count }).map((_, idx) => (
            <Input
              key={idx}
              aria-label={`${port.label} ${idx + 1}`}
              className="h-7 text-xs"
              type="number"
              {...inputProps}
              value={finiteValue(value[idx], finiteValue(fallback[idx]))}
              onChange={(e) => {
                const next = [...value];
                next[idx] = clampValue(parseFloat(e.target.value), port);
                updateSelectedInput(port, next);
              }}
            />
          ))}
        </div>
      );
    }

    return null;
  }

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
                min={optionalFiniteValue(selected.data.min)}
                max={optionalFiniteValue(selected.data.max)}
                step={optionalFiniteValue(selected.data.step) ?? 0.01}
                value={finiteValue(selected.data.values?.val)}
                onChange={(e) =>
                  updateNodeData(selected.id, {
                    values: {
                      ...selected.data.values,
                      val: clampValue(parseFloat(e.target.value), {
                        id: 'val',
                        label: 'Value',
                        type: 'float',
                        min: optionalFiniteValue(selected.data.min),
                        max: optionalFiniteValue(selected.data.max),
                      }),
                    },
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
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] text-muted-foreground">Vec4 Value</Label>
                <span
                  className="size-5 rounded border border-input"
                  style={{ backgroundColor: vec4ToHex(selectedVec4), opacity: selectedVec4[3] }}
                />
              </div>
              <Tabs value={vec4EditMode} onValueChange={(value) => setVec4EditMode(value as 'vector' | 'color')}>
                <TabsList className="h-7 w-full rounded-md">
                  <TabsTrigger className="h-5 text-[10px]" value="vector">Vector</TabsTrigger>
                  <TabsTrigger className="h-5 text-[10px]" value="color">Color</TabsTrigger>
                </TabsList>
                <TabsContent value="vector" className="mt-1">
                  <div className="grid grid-cols-2 gap-1">
                    {[0, 1, 2, 3].map((idx) => (
                      <Input
                        key={idx}
                        aria-label={['R', 'G', 'B', 'A'][idx]}
                        className="h-7 text-xs"
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        value={selectedVec4[idx]}
                        onChange={(e) => {
                          const next = [...selectedVec4] as [number, number, number, number];
                          next[idx] = clamp01(parseFloat(e.target.value));
                          updateSelectedVec4(next);
                        }}
                      />
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="color" className="mt-1">
                  <div className="flex items-center gap-2">
                    <label
                      className="relative size-8 shrink-0 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-colors hover:bg-muted"
                      title="Edit RGB as color"
                    >
                      <span className="sr-only">Edit RGB as color</span>
                      <span
                        className="absolute inset-1 rounded-sm"
                        style={{ backgroundColor: vec4ToHex(selectedVec4) }}
                      />
                      <input
                        type="color"
                        value={vec4ToHex(selectedVec4)}
                        onChange={(event) => {
                          const rgb = hexToRgb(event.target.value);
                          if (!rgb) return;
                          updateSelectedVec4([rgb[0], rgb[1], rgb[2], selectedVec4[3]]);
                        }}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <Input
                      aria-label="Alpha"
                      className="h-8 text-xs"
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={selectedVec4[3]}
                      onChange={(e) =>
                        updateSelectedVec4([selectedVec4[0], selectedVec4[1], selectedVec4[2], clamp01(parseFloat(e.target.value))])
                      }
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {(selected.data.nodeType === 'TextureInput' || selected.data.nodeType === 'TextureUniformColor') && (
            <div className="grid gap-2 rounded border border-border/70 p-2">
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Uniform Name</Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={String(selected.data.uniformName ?? '')}
                  placeholder={shaderTextureUniformName(selected.id)}
                  onChange={(e) => updateNodeData(selected.id, { uniformName: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-muted-foreground">Texture File</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {selectedTextureUpload?.filename ?? 'Fallback texture until a file is loaded'}
                  </div>
                </div>
                <div className="flex gap-1">
                  {selectedTextureUpload && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="Clear texture file"
                      onClick={() => clearTextureUpload(selected.id)}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-7"
                    title="Upload texture file"
                    onClick={() => void uploadSelectedTexture()}
                  >
                    <FolderOpenIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Preview and runtime uploads bind this texture by name. Use one node for each extra texture.
              </p>
            </div>
          )}

          {def.inputs.length > 0 && (
            <div className="grid gap-2">
              <div className="text-[10px] text-muted-foreground font-medium mb-0.5">Inputs</div>
              {def.inputs.map((port) => {
                const connected = edges.some((edge) => edge.target === selected.id && edge.targetHandle === port.id);
                return (
                  <div key={port.id} className="grid gap-1 rounded border border-border/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">{port.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {connected ? 'connected' : port.type}
                      </span>
                    </div>
                    {!connected && renderPortValueEditor(port)}
                  </div>
                );
              })}
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
