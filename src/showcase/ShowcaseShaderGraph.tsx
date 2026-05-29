import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DownloadIcon, FolderOpenIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { GeneratedGlsl, PlaygroundTarget, ShaderEdge, ShaderNodeInstance, ShaderParameter, ShaderSubgraph } from '@/types/shader-graph';
import { NodePalette } from '@/pages/shader-graph/NodePalette';
import { ShaderCanvas } from '@/pages/shader-graph/ShaderCanvas';
import { ShaderRightPanel } from '@/pages/shader-graph/ShaderRightPanel';
import { codegen } from '@/pages/shader-graph/codegen';
import { diagnoseShaderGraph } from '@/pages/shader-graph/diagnostics';
import { instantiateShaderGraphPreset, SHADER_GRAPH_PRESETS } from '@/pages/shader-graph/presets';
import { LoveJsPreview } from './LoveJsPreview';

const FILE_VERSION = 3;
const FILE_EXTENSION = 'feathershgh';
const FIRST_OPEN_PRESET_ID = 'water-shimmer';

type FeatherShaderGraphFile = {
  type: 'feather.shader-graph';
  version: number;
  exportedAt: string;
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  subgraphs: ShaderSubgraph[];
  activeTemplateInstanceId?: string | null;
  lastGeneratedGlsl?: GeneratedGlsl | null;
};

function defaultFilename(shaderName: string) {
  const base =
    shaderName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shader-graph';
  return `${base}.${FILE_EXTENSION}`;
}

function parseShaderGraphFile(raw: string): FeatherShaderGraphFile {
  const parsed = JSON.parse(raw) as Partial<FeatherShaderGraphFile>;
  if (parsed.type !== 'feather.shader-graph' || ![1, 2, FILE_VERSION].includes(Number(parsed.version))) {
    throw new Error('Unsupported shader graph file');
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Shader graph file is missing nodes or edges');
  }
  return {
    type: 'feather.shader-graph',
    version: FILE_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    shaderName: typeof parsed.shaderName === 'string' ? parsed.shaderName : 'my-shader',
    playgroundTarget: parsed.playgroundTarget ?? null,
    nodes: parsed.nodes,
    edges: parsed.edges,
    subgraphs: Array.isArray(parsed.subgraphs) ? parsed.subgraphs : [],
    activeTemplateInstanceId: typeof parsed.activeTemplateInstanceId === 'string' ? parsed.activeTemplateInstanceId : null,
    lastGeneratedGlsl: parsed.lastGeneratedGlsl ?? null,
  };
}

export function ShowcaseShaderGraph() {
  const nodes = useShaderGraphStore((state) => state.nodes);
  const edges = useShaderGraphStore((state) => state.edges);
  const subgraphs = useShaderGraphStore((state) => state.subgraphs);
  const shaderName = useShaderGraphStore((state) => state.shaderName);
  const playgroundTarget = useShaderGraphStore((state) => state.playgroundTarget);
  const lastGeneratedGlsl = useShaderGraphStore((state) => state.lastGeneratedGlsl);
  const hasInitializedExample = useShaderGraphStore((state) => state.hasInitializedExample);
  const loadGraph = useShaderGraphStore((state) => state.loadGraph);
  const addNodesAndEdges = useShaderGraphStore((state) => state.addNodesAndEdges);
  const setSubgraphs = useShaderGraphStore((state) => state.setSubgraphs);
  const setActiveTemplateInstanceId = useShaderGraphStore((state) => state.setActiveTemplateInstanceId);
  const isDirty = useShaderGraphStore((state) => state.isDirty);
  const markClean = useShaderGraphStore((state) => state.markClean);
  const setHasInitializedExample = useShaderGraphStore((state) => state.setHasInitializedExample);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewParams, setPreviewParams] = useState<{
    shape: string;
    color: string;
    baseTexture: { filename: string; dataBase64: string } | null;
    parameters: ShaderParameter[];
    textures: { filename: string; dataBase64: string; uniform: string }[];
    previewZoom: number;
  }>({ shape: 'circle', color: '#ffffff', baseTexture: null, parameters: [], textures: [], previewZoom: 1 });

  const handlePreviewParamsChange = useCallback(
    (params: {
      shape: string;
      color: string;
      baseTexture: { filename: string; dataBase64: string } | null;
      parameters: ShaderParameter[];
      textures: { filename: string; dataBase64: string; uniform: string }[];
      previewZoom: number;
    }) => {
      setPreviewParams(params);
    },
    [],
  );

  useEffect(() => {
    if (hasInitializedExample) return;
    if (nodes.length > 0 || edges.length > 0) {
      setHasInitializedExample(true);
      return;
    }
    const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === FIRST_OPEN_PRESET_ID);
    if (!preset) {
      setHasInitializedExample(true);
      return;
    }
    const template = instantiateShaderGraphPreset(preset, { includeOutput: true });
    loadGraph({
      nodes: template.nodes,
      edges: template.edges,
      subgraphs: template.subgraphs,
      activeTemplateInstanceId: template.activeTemplateInstanceId,
      shaderName: preset.shaderName,
      playgroundTarget,
    });
  }, [edges.length, hasInitializedExample, loadGraph, nodes.length, playgroundTarget, setHasInitializedExample]);

  const glsl = useMemo(() => lastGeneratedGlsl ?? codegen(nodes, edges, subgraphs), [edges, lastGeneratedGlsl, nodes, subgraphs]);

  function importRaw(raw: string) {
    const parsed = parseShaderGraphFile(raw);
    const diagnostics = diagnoseShaderGraph({
      nodes: parsed.nodes,
      edges: parsed.edges,
      subgraphs: parsed.subgraphs,
    });
    loadGraph({
      nodes: parsed.nodes,
      edges: parsed.edges,
      subgraphs: parsed.subgraphs,
      shaderName: parsed.shaderName,
      playgroundTarget: parsed.playgroundTarget,
      activeTemplateInstanceId: parsed.activeTemplateInstanceId ?? null,
    });
    const blockingCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    if (blockingCount > 0) {
      toast.warning(`Shader graph imported with ${blockingCount} blocking diagnostic${blockingCount === 1 ? '' : 's'}`);
    } else if (diagnostics.length > 0) {
      toast.info(`Shader graph imported with ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}`);
    } else {
      toast.success('Shader graph imported');
    }
  }

  function exportGraph() {
    const payload: FeatherShaderGraphFile = {
      type: 'feather.shader-graph',
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      shaderName,
      playgroundTarget,
      nodes,
      edges,
      subgraphs,
      activeTemplateInstanceId: useShaderGraphStore.getState().activeTemplateInstanceId,
      lastGeneratedGlsl,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename(shaderName);
    a.click();
    URL.revokeObjectURL(url);
    markClean();
  }

  function clearGraph() {
    if ((nodes.length > 0 || edges.length > 0) && !window.confirm('Clear the current shader graph?')) return;
    loadGraph({
      nodes: [],
      edges: [],
      subgraphs: [],
      activeTemplateInstanceId: null,
      shaderName,
      playgroundTarget,
    });
    toast.success('Shader graph cleared');
  }

  function loadPreset(presetId: string) {
    const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    if (isDirty() && !window.confirm('Replace the current shader graph with this preset? Unsaved changes will be lost.')) return;
    const template = instantiateShaderGraphPreset(preset, { includeOutput: true });
    loadGraph({
      nodes: template.nodes,
      edges: template.edges,
      subgraphs: template.subgraphs,
      activeTemplateInstanceId: template.activeTemplateInstanceId,
      shaderName: preset.shaderName,
      playgroundTarget,
    });
    toast.success(`Loaded ${preset.name}`);
  }

  function insertPreset(presetId: string) {
    const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const maxX = nodes.length ? Math.max(...nodes.map((node) => node.position.x)) : 0;
    const template = instantiateShaderGraphPreset(preset, {
      includeOutput: false,
      position: { x: maxX + 260, y: 80 },
    });
    if (template.subgraphs.length > 0) setSubgraphs([...subgraphs, ...template.subgraphs]);
    addNodesAndEdges(template.nodes, template.edges, template.activeTemplateInstanceId ?? template.nodes[0]?.id ?? null);
    setActiveTemplateInstanceId(template.activeTemplateInstanceId);
    toast.success(`Inserted ${preset.name}`);
  }

  return (
    <ReactFlowProvider>
      <div className="relative flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <div>
            <h1 className="text-sm font-semibold">Shader Graph</h1>
            <p className="text-xs text-muted-foreground">Standalone browser authoring for Feather GLSL graphs</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Select onValueChange={loadPreset}>
              <SelectTrigger aria-label="Load preset" className="h-8 w-48 text-xs">
                <SelectValue placeholder="Load preset" />
              </SelectTrigger>
              <SelectContent>
                {SHADER_GRAPH_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} title={preset.description}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={insertPreset}>
              <SelectTrigger aria-label="Insert preset" className="h-8 w-48 text-xs">
                <SelectValue placeholder="Insert preset" />
              </SelectTrigger>
              <SelectContent>
                {SHADER_GRAPH_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} title={preset.description}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={() => fileInputRef.current?.click()}>
              <FolderOpenIcon className="size-4" />
              Import
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={clearGraph}>
              <Trash2Icon className="size-4" />
              Clear
            </Button>
            <Button size="sm" className="h-8 gap-2 text-xs" onClick={exportGraph}>
              <DownloadIcon className="size-4" />
              Export
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={`.${FILE_EXTENSION},application/json`}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              file.text().then(importRaw).catch((error: unknown) => {
                toast.error(error instanceof Error ? error.message : 'Failed to import shader graph');
              });
            }}
          />
        </header>

        <ResizablePanelGroup orientation="horizontal" className="h-0 min-h-0 flex-1 overflow-hidden">
          <ResizablePanel defaultSize="16%" minSize="12%" maxSize="25%" className="flex min-h-0 flex-col border-r">
            <div className="border-b px-3 py-2 shrink-0">
              <span className="text-sm font-semibold">Nodes</span>
            </div>
            <NodePalette />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="49%" minSize="30%" className="min-h-0 min-w-0 overflow-hidden">
            <ShaderCanvas />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="35%" minSize="24%" maxSize="48%" className="flex min-h-0 flex-col border-l">
            <ShaderRightPanel standalone onPreviewParamsChange={handlePreviewParamsChange} />
          </ResizablePanel>
        </ResizablePanelGroup>
        <LoveJsPreview
          floating
          title="Shader Preview"
          description="The standalone build posts generated GLSL into this isolated preview frame."
          payload={{
            tool: 'shader-graph',
            shaderName,
            pixel: glsl.pixel,
            vertex: glsl.vertex,
            previewShape: previewParams.shape,
            previewColor: previewParams.color,
            baseTexture: previewParams.baseTexture,
            parameters: previewParams.parameters,
            textures: previewParams.textures,
            previewZoom: previewParams.previewZoom,
          }}
        />
      </div>
    </ReactFlowProvider>
  );
}
