import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { PortDef, ShaderNodeInstance } from '@/types/shader-graph';
import { cn } from '@/utils/styles';
import { FolderOpenIcon, LocateFixedIcon, RotateCcwIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ShaderNumberInput } from './ShaderNumberInput';
import { pickShaderTexture } from './textureUpload';
import { TextureLabDialog } from '@/pages/texture-lab/TextureLabDialog';

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function finiteValue(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function defaultPortValue(port: PortDef): number | number[] {
  if (port.defaultValue !== undefined) return Array.isArray(port.defaultValue) ? [...port.defaultValue] : port.defaultValue;
  if (port.type === 'vec2') return [0, 0];
  if (port.type === 'vec3') return [0, 0, 0];
  if (port.type === 'vec4') return [1, 1, 1, 1];
  return 0;
}

function clampPortValue(value: number, port: PortDef): number {
  if (!Number.isFinite(value)) return finiteValue(port.defaultValue);
  if (port.min !== undefined && value < port.min) return port.min;
  if (port.max !== undefined && value > port.max) return port.max;
  return value;
}

function vec4Value(value: unknown, fallback: number[] = [1, 1, 1, 1]): [number, number, number, number] {
  const raw = Array.isArray(value) ? value : fallback;
  return [
    clamp01(finiteValue(raw[0], fallback[0] ?? 1)),
    clamp01(finiteValue(raw[1], fallback[1] ?? 1)),
    clamp01(finiteValue(raw[2], fallback[2] ?? 1)),
    clamp01(finiteValue(raw[3], fallback[3] ?? 1)),
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

function isTextureNode(node: ShaderNodeInstance | null | undefined): boolean {
  return node?.data.nodeType === 'TextureInput' || node?.data.nodeType === 'TextureUniformColor' || node?.data.nodeType === 'TextureParameter';
}

export function TemplateControlsPanel() {
  const nodes = useShaderGraphStore((state) => state.nodes);
  const edges = useShaderGraphStore((state) => state.edges);
  const subgraphs = useShaderGraphStore((state) => state.subgraphs);
  const activeSubgraphId = useShaderGraphStore((state) => state.activeSubgraphId);
  const activeTemplateInstanceId = useShaderGraphStore((state) => state.activeTemplateInstanceId);
  const updateNodeData = useShaderGraphStore((state) => state.updateNodeData);
  const selectNode = useShaderGraphStore((state) => state.selectNode);
  const enterSubgraph = useShaderGraphStore((state) => state.enterSubgraph);
  const textureUploads = useShaderGraphStore((state) => state.textureUploads);
  const setTextureUpload = useShaderGraphStore((state) => state.setTextureUpload);
  const clearTextureUpload = useShaderGraphStore((state) => state.clearTextureUpload);

  const instance = nodes.find((node) => node.id === activeTemplateInstanceId && node.data.nodeType === 'SubgraphInstance');
  const subgraph = instance?.data.subgraphId ? subgraphs.find((item) => item.id === instance.data.subgraphId) : null;
  const publicPorts = subgraph?.inputs.filter((port) => port.uiRole === 'control' || port.uiRole === 'texture') ?? [];

  if (!instance || !subgraph || publicPorts.length === 0) return null;
  const templateSubgraph = subgraph;

  function setInstanceValue(port: PortDef, value: number | number[]) {
    if (!instance) return;
    updateNodeData(instance.id, {
      values: {
        ...instance.data.values,
        [port.id]: Array.isArray(value) ? [...value] : value,
      },
    });
  }

  function resetControls() {
    if (!instance) return;
    const nextValues = { ...(instance.data.values ?? {}) };
    for (const port of publicPorts) {
      if (port.uiRole !== 'control') continue;
      nextValues[port.id] = defaultPortValue(port);
    }
    updateNodeData(instance.id, { values: nextValues });

    for (const port of publicPorts) {
      if (port.uiRole !== 'texture') continue;
      const sourceNode = textureSourceNode(port);
      if (sourceNode) clearTextureUpload(sourceNode.id);
    }
    toast.success('Template controls reset');
  }

  function textureSourceNode(port: PortDef): ShaderNodeInstance | null {
    const edge = edges.find((item) => item.target === instance?.id && item.targetHandle === port.id);
    const node = edge ? nodes.find((item) => item.id === edge.source) : null;
    return isTextureNode(node) ? node ?? null : null;
  }

  async function uploadTexture(port: PortDef) {
    const source = textureSourceNode(port);
    if (!source) return;
    const texture = await pickShaderTexture();
    if (!texture) return;
    setTextureUpload(source.id, texture);
    toast.success(`${port.label} loaded: ${texture.filename}`);
  }

  function generateTexture(port: PortDef, filename: string, dataBase64: string) {
    const source = textureSourceNode(port);
    if (!source) return;
    setTextureUpload(source.id, { filename, dataBase64 });
    toast.success(`${port.label} generated: ${filename}`);
  }

  function selectTemplateSource(port: PortDef) {
    if (port.uiRole === 'texture') {
      const source = textureSourceNode(port);
      if (source) selectNode(source.id);
      return;
    }
    const mapping = templateSubgraph.inputMappings[port.id];
    if (!mapping) return;
    if (activeSubgraphId !== templateSubgraph.id) {
      enterSubgraph(templateSubgraph.id);
      requestAnimationFrame(() => selectNode(mapping.nodeId));
    } else {
      selectNode(mapping.nodeId);
    }
  }

  function renderControl(port: PortDef) {
    const rawValue = instance?.data.values?.[port.id] ?? defaultPortValue(port);
    const inputProps = { min: port.min, max: port.max, step: port.step ?? 0.01 };

    if (port.type === 'float') {
      return (
        <ShaderNumberInput
          className="h-7 text-xs"
          {...inputProps}
          value={finiteValue(rawValue, finiteValue(port.defaultValue))}
          onValueChange={(value) => setInstanceValue(port, clampPortValue(value, port))}
        />
      );
    }

    if (port.type === 'vec4') {
      const fallback = defaultPortValue(port) as number[];
      const rgba = vec4Value(rawValue, fallback);
      return (
        <div className="flex items-center gap-2">
          <label
            className="relative size-8 shrink-0 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-colors hover:bg-muted"
            title={`Edit ${port.label} color`}
          >
            <span className="sr-only">Edit {port.label} color</span>
            <span className="absolute inset-1 rounded-sm" style={{ backgroundColor: vec4ToHex(rgba) }} />
            <input
              type="color"
              value={vec4ToHex(rgba)}
              onChange={(event) => {
                const rgb = hexToRgb(event.target.value);
                if (!rgb) return;
                setInstanceValue(port, [rgb[0], rgb[1], rgb[2], rgba[3]]);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <ShaderNumberInput
            aria-label={`${port.label} alpha`}
            className="h-8 text-xs"
            min={0}
            max={1}
            step={port.step ?? 0.01}
            value={rgba[3]}
            onValueChange={(value) => setInstanceValue(port, [rgba[0], rgba[1], rgba[2], clamp01(value)])}
          />
        </div>
      );
    }

    if (port.type === 'vec2' || port.type === 'vec3') {
      const count = port.type === 'vec2' ? 2 : 3;
      const fallback = defaultPortValue(port) as number[];
      const value = Array.isArray(rawValue) ? rawValue : fallback;
      return (
        <div className={cn('grid gap-1', count === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {Array.from({ length: count }).map((_, index) => (
            <ShaderNumberInput
              key={index}
              aria-label={`${port.label} ${index + 1}`}
              className="h-7 text-xs"
              {...inputProps}
              value={finiteValue(value[index], finiteValue(fallback[index]))}
              onValueChange={(nextValue) => {
                const next = [...value];
                next[index] = clampPortValue(nextValue, port);
                setInstanceValue(port, next);
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <Input
        className="h-7 text-xs"
        value={String(rawValue)}
        readOnly
      />
    );
  }

  return (
    <div data-testid="shader-template-controls" className="grid gap-3 border-b bg-muted/15 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <SlidersHorizontalIcon className="size-3.5" />
            Template Controls
          </div>
          <div className="truncate text-sm font-semibold">{templateSubgraph.name}</div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={resetControls}
        >
          <RotateCcwIcon className="size-3.5" />
          Reset
        </Button>
      </div>

      <div className="grid gap-2">
        {publicPorts.map((port) => {
          const sourceNode = port.uiRole === 'texture' ? textureSourceNode(port) : null;
          const upload = sourceNode ? textureUploads[sourceNode.id] : null;
          return (
            <div key={port.id} className="grid gap-1 rounded border border-border/70 bg-card/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="truncate text-[10px] font-medium text-muted-foreground">{port.label}</Label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  title={port.uiRole === 'texture' ? 'Select source node' : 'Select boundary node'}
                  onClick={() => selectTemplateSource(port)}
                >
                  <LocateFixedIcon className="size-3.5" />
                </Button>
              </div>

              {port.uiRole === 'texture' ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[10px] text-muted-foreground">
                    <div className="truncate">{upload?.filename ?? 'No texture uploaded'}</div>
                    {!sourceNode && <div className="text-yellow-600 dark:text-yellow-400">Connect a root texture node to this slot.</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {sourceNode && upload && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title="Clear texture slot"
                        onClick={() => clearTextureUpload(sourceNode.id)}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      title="Upload texture slot"
                      disabled={!sourceNode}
                      onClick={() => void uploadTexture(port)}
                    >
                      <FolderOpenIcon className="size-3.5" />
                    </Button>
                    <TextureLabDialog
                      triggerClassName="size-7"
                      triggerTitle="Generate texture slot"
                      triggerTestId="shader-template-texture-generate"
                      applyLabel="Use for slot"
                      disabled={!sourceNode}
                      onApply={(texture) => generateTexture(port, texture.filename, texture.dataBase64)}
                    />
                  </div>
                </div>
              ) : (
                renderControl(port)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
