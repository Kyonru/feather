import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { NodeType, ShaderNodeInstance, ShaderSubgraph } from '@/types/shader-graph';
import { cn } from '@/utils/styles';
import { FolderOpenIcon, LocateFixedIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ShaderNumberInput } from './ShaderNumberInput';
import { shaderParameterUniformName } from './glslUtils';
import { getNodeDef } from './nodeDefs';
import { pickShaderTexture } from './textureUpload';

const PARAMETER_NODE_TYPES = new Set<NodeType>([
  'FloatParameter',
  'Vec2Parameter',
  'Vec3Parameter',
  'Vec4Parameter',
  'ColorParameter',
  'BooleanParameter',
  'TextureParameter',
]);

const PARAMETER_TYPE_LABEL: Record<string, string> = {
  FloatParameter: 'float',
  Vec2Parameter: 'vec2',
  Vec3Parameter: 'vec3',
  Vec4Parameter: 'vec4',
  ColorParameter: 'color',
  BooleanParameter: 'bool',
  TextureParameter: 'texture',
};

function finiteValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function vec4Value(value: unknown): [number, number, number, number] {
  const raw = Array.isArray(value) ? value : [1, 1, 1, 1];
  return [
    clamp01(finiteValue(raw[0], 1)),
    clamp01(finiteValue(raw[1], 1)),
    clamp01(finiteValue(raw[2], 1)),
    clamp01(finiteValue(raw[3], 1)),
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

function vecValue(value: unknown, count: 2 | 3 | 4): number[] {
  const fallback = count === 4 ? [1, 1, 1, 1] : Array.from({ length: count }, () => 0);
  const raw = Array.isArray(value) ? value : fallback;
  return Array.from({ length: count }, (_, index) => finiteValue(raw[index], fallback[index]));
}

function isParameterNode(node: ShaderNodeInstance): boolean {
  return PARAMETER_NODE_TYPES.has(node.data.nodeType);
}

function hasTemplateControls(nodes: ShaderNodeInstance[], subgraphs: ShaderSubgraph[], activeTemplateInstanceId: string | null) {
  const instance = nodes.find((node) => node.id === activeTemplateInstanceId && node.data.nodeType === 'SubgraphInstance');
  const subgraph = instance?.data.subgraphId ? subgraphs.find((item) => item.id === instance.data.subgraphId) : null;
  return Boolean(subgraph?.inputs.some((port) => port.uiRole === 'control' || port.uiRole === 'texture'));
}

export function ShaderControlsPanel({ onFocusSelection }: { onFocusSelection?: () => void } = {}) {
  const nodes = useShaderGraphStore((state) => state.nodes);
  const edges = useShaderGraphStore((state) => state.edges);
  const subgraphs = useShaderGraphStore((state) => state.subgraphs);
  const activeSubgraphId = useShaderGraphStore((state) => state.activeSubgraphId);
  const activeTemplateInstanceId = useShaderGraphStore((state) => state.activeTemplateInstanceId);
  const textureUploads = useShaderGraphStore((state) => state.textureUploads);
  const updateNodeData = useShaderGraphStore((state) => state.updateNodeData);
  const focusRootNode = useShaderGraphStore((state) => state.focusRootNode);
  const setTextureUpload = useShaderGraphStore((state) => state.setTextureUpload);
  const clearTextureUpload = useShaderGraphStore((state) => state.clearTextureUpload);
  const parameterNodes = nodes.filter(isParameterNode);
  const hasTemplate = hasTemplateControls(nodes, subgraphs, activeTemplateInstanceId);

  function setValue(node: ShaderNodeInstance, value: number | number[]) {
    updateNodeData(node.id, {
      values: {
        ...node.data.values,
        val: Array.isArray(value) ? [...value] : value,
      },
    });
  }

  async function uploadTexture(node: ShaderNodeInstance) {
    const texture = await pickShaderTexture();
    if (!texture) return;
    setTextureUpload(node.id, texture);
    toast.success(`${node.data.label || 'Texture'} loaded: ${texture.filename}`);
  }

  function renderValueEditor(node: ShaderNodeInstance) {
    const value = node.data.values?.val;

    if (node.data.nodeType === 'FloatParameter') {
      return (
        <ShaderNumberInput
          aria-label={`${node.data.label} value`}
          className="h-8 text-xs"
          step={0.01}
          value={finiteValue(value)}
          onValueChange={(nextValue) => setValue(node, nextValue)}
        />
      );
    }

    if (node.data.nodeType === 'BooleanParameter') {
      return (
        <div className="flex h-8 items-center justify-between gap-2 rounded border border-border/70 px-2">
          <span className="text-[10px] text-muted-foreground">Enabled</span>
          <Switch
            checked={finiteValue(value) >= 0.5}
            onCheckedChange={(checked) => setValue(node, checked ? 1 : 0)}
          />
        </div>
      );
    }

    if (node.data.nodeType === 'Vec2Parameter' || node.data.nodeType === 'Vec3Parameter' || node.data.nodeType === 'Vec4Parameter') {
      const count = node.data.nodeType === 'Vec2Parameter' ? 2 : node.data.nodeType === 'Vec3Parameter' ? 3 : 4;
      const nextValue = vecValue(value, count);
      return (
        <div className={cn('grid gap-1', count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {Array.from({ length: count }).map((_, index) => (
            <ShaderNumberInput
              key={index}
              aria-label={`${node.data.label} ${index + 1}`}
              className="h-8 text-xs"
              step={0.01}
              value={nextValue[index]}
              onValueChange={(changed) => {
                const updated = [...nextValue];
                updated[index] = changed;
                setValue(node, updated);
              }}
            />
          ))}
        </div>
      );
    }

    if (node.data.nodeType === 'ColorParameter') {
      const rgba = vec4Value(value);
      return (
        <div className="flex items-center gap-2">
          <label
            className="relative size-8 shrink-0 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-colors hover:bg-muted"
            title={`Edit ${node.data.label} color`}
          >
            <span className="sr-only">{`Edit ${node.data.label} color`}</span>
            <span className="absolute inset-1 rounded-sm" style={{ backgroundColor: vec4ToHex(rgba) }} />
            <input
              type="color"
              value={vec4ToHex(rgba)}
              onChange={(event) => {
                const rgb = hexToRgb(event.target.value);
                if (!rgb) return;
                setValue(node, [rgb[0], rgb[1], rgb[2], rgba[3]]);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <ShaderNumberInput
            aria-label={`${node.data.label} alpha`}
            className="h-8 text-xs"
            min={0}
            max={1}
            step={0.01}
            value={rgba[3]}
            onValueChange={(alpha) => setValue(node, [rgba[0], rgba[1], rgba[2], clamp01(alpha)])}
          />
        </div>
      );
    }

    if (node.data.nodeType === 'TextureParameter') {
      const upload = textureUploads[node.id];
      return (
        <div className="flex items-center justify-between gap-2 rounded border border-border/70 p-2">
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-muted-foreground">Texture File</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {upload?.filename ?? 'Fallback texture until a file is loaded'}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {upload && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Clear texture file"
                onClick={() => clearTextureUpload(node.id)}
              >
                <XIcon className="size-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              title="Upload texture file"
              onClick={() => void uploadTexture(node)}
            >
              <FolderOpenIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div data-testid="shader-controls-panel" className="grid gap-3 p-3 text-xs">
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontalIcon className="size-3.5" />
          Shader Controls
        </div>
        <p className="text-[10px] text-muted-foreground">
          Root graph parameters collected in one place.
        </p>
        {activeSubgraphId && (
          <p className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-700 dark:text-sky-300">
            Showing root graph controls while editing inside a subgraph.
          </p>
        )}
      </div>

      {parameterNodes.length === 0 ? (
        <div className="grid min-h-24 place-items-center rounded border border-dashed bg-muted/15 p-4 text-center text-[10px] text-muted-foreground">
          {hasTemplate
            ? 'No root parameter nodes in this graph.'
            : 'Add Parameter nodes to expose shader controls.'}
        </div>
      ) : (
        <div className="grid gap-2">
          {parameterNodes.map((node) => {
            const def = getNodeDef(node.data);
            const connected = edges.some((edge) => edge.source === node.id);
            const uniform = shaderParameterUniformName(node.id, node.data.uniformName);
            return (
              <div key={node.id} className="grid gap-2 rounded border border-border/70 bg-card/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="h-5 rounded px-1.5 text-[9px] font-mono">
                        {PARAMETER_TYPE_LABEL[node.data.nodeType]}
                      </Badge>
                      {!connected && (
                        <Badge className="h-5 rounded bg-yellow-500/15 px-1.5 text-[9px] text-yellow-700 dark:text-yellow-300">
                          Not connected
                        </Badge>
                      )}
                    </div>
                    <Input
                      aria-label={`${node.data.label} label`}
                      className="mt-1 h-8 text-xs"
                      value={String(node.data.label ?? def?.label ?? 'Parameter')}
                      onChange={(event) => updateNodeData(node.id, { label: event.target.value })}
                      onBlur={(event) => {
                        if (event.target.value.trim().length === 0) {
                          updateNodeData(node.id, { label: def?.label ?? 'Parameter' });
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    title="Select parameter node"
                    onClick={() => {
                      focusRootNode(node.id);
                      onFocusSelection?.();
                    }}
                  >
                    <LocateFixedIcon className="size-3.5" />
                  </Button>
                </div>

                {renderValueEditor(node)}

                <details className="group rounded border border-border/60 bg-muted/20 px-2 py-1">
                  <summary className="cursor-pointer select-none text-[10px] font-medium text-muted-foreground">
                    Uniform
                  </summary>
                  <div className="mt-2 grid gap-1">
                    <Label className="text-[10px] text-muted-foreground">Uniform Name</Label>
                    <Input
                      aria-label={`${node.data.label} uniform name`}
                      className="h-7 text-xs font-mono"
                      value={String(node.data.uniformName ?? '')}
                      placeholder={uniform}
                      onChange={(event) =>
                        updateNodeData(node.id, { uniformName: shaderParameterUniformName(node.id, event.target.value) })
                      }
                    />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
