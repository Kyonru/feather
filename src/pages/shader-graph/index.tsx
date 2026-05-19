import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { DownloadIcon, FolderOpenIcon, Trash2Icon, WorkflowIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePluginControl } from '@/hooks/use-plugin-control';
import { useSessionStore } from '@/store/session';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { GeneratedGlsl, PlaygroundTarget, ShaderEdge, ShaderNodeInstance } from '@/types/shader-graph';
import { isWeb } from '@/utils/platform';
import { NodePalette } from './NodePalette';
import { ShaderCanvas } from './ShaderCanvas';
import { NodeInspector } from './NodeInspector';
import { CodePreview } from './CodePreview';
import { SHADER_GRAPH_PRESETS } from './presets';

const FILE_VERSION = 1;
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
  if (parsed.type !== 'feather.shader-graph' || parsed.version !== FILE_VERSION) {
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
    lastGeneratedGlsl: parsed.lastGeneratedGlsl ?? null,
  };
}

export default function ShaderGraph() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const shaderGraphPlugin = usePluginControl('shader-graph');
  const nodes = useShaderGraphStore((state) => state.nodes);
  const edges = useShaderGraphStore((state) => state.edges);
  const shaderName = useShaderGraphStore((state) => state.shaderName);
  const playgroundTarget = useShaderGraphStore((state) => state.playgroundTarget);
  const lastGeneratedGlsl = useShaderGraphStore((state) => state.lastGeneratedGlsl);
  const hasInitializedExample = useShaderGraphStore((state) => state.hasInitializedExample);
  const loadGraph = useShaderGraphStore((state) => state.loadGraph);
  const setHasInitializedExample = useShaderGraphStore((state) => state.setHasInitializedExample);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    loadGraph({
      nodes: preset.nodes,
      edges: preset.edges,
      shaderName: preset.shaderName,
      playgroundTarget,
    });
  }, [edges.length, hasInitializedExample, loadGraph, nodes.length, playgroundTarget, setHasInitializedExample]);

  const importRaw = (raw: string) => {
    const parsed = parseShaderGraphFile(raw);
    loadGraph({
      nodes: parsed.nodes,
      edges: parsed.edges,
      shaderName: parsed.shaderName,
      playgroundTarget: parsed.playgroundTarget,
    });
    toast.success('Shader graph imported');
  };

  const exportGraph = async () => {
    const payload: FeatherShaderGraphFile = {
      type: 'feather.shader-graph',
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      shaderName,
      playgroundTarget,
      nodes,
      edges,
      lastGeneratedGlsl,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = defaultFilename(shaderName);

    if (isWeb()) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'Feather Shader Graph', extensions: [FILE_EXTENSION] }],
    });
    if (!path) return;
    await writeTextFile(path, json);
    toast.success('Shader graph exported');
  };

  const importGraph = async () => {
    if (isWeb()) {
      fileInputRef.current?.click();
      return;
    }

    const path = await openDialog({
      filters: [{ name: 'Feather Shader Graph', extensions: [FILE_EXTENSION] }],
      multiple: false,
    });
    if (!path || typeof path !== 'string') return;
    importRaw(await readTextFile(path));
  };

  const clearGraph = () => {
    if (nodes.length > 0 || edges.length > 0) {
      const confirmed = window.confirm('Clear the current shader graph? This removes all nodes and connections.');
      if (!confirmed) return;
    }
    loadGraph({
      nodes: [],
      edges: [],
      shaderName,
      playgroundTarget,
    });
    toast.success('Shader graph cleared');
  };

  const loadPreset = (presetId: string) => {
    const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    loadGraph({
      nodes: preset.nodes,
      edges: preset.edges,
      shaderName: preset.shaderName,
      playgroundTarget,
    });
    toast.success(`Loaded ${preset.name}`);
  };

  return (
    <ReactFlowProvider>
      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <div>
            <h1 className="text-sm font-semibold">Shader Graph</h1>
            <p className="text-xs text-muted-foreground">{shaderName}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="shader-graph-enabled"
                size="sm"
                checked={shaderGraphPlugin.enabled}
                disabled={shaderGraphPlugin.enabled ? !sessionId : !shaderGraphPlugin.available || !sessionId}
                onCheckedChange={(enabled) => shaderGraphPlugin.setEnabled(enabled)}
              />
              <Label htmlFor="shader-graph-enabled" className="text-xs text-muted-foreground">
                Enabled
              </Label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Select onValueChange={loadPreset}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder="Load preset flow" />
                </SelectTrigger>
                <SelectContent>
                  {SHADER_GRAPH_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} title={preset.description}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={importGraph}>
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
              file
                .text()
                .then(importRaw)
                .catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : 'Failed to import shader graph');
                });
            }}
          />
        </header>

        {!shaderGraphPlugin.enabled ? (
          <div className="flex h-0 min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-md border bg-muted/40">
                <WorkflowIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="grid gap-1">
                <p className="text-sm font-semibold">Shader Graph is disabled</p>
                <p className="text-xs text-muted-foreground">
                  {!sessionId
                    ? 'Connect a session to enable this plugin.'
                    : !shaderGraphPlugin.available
                      ? 'Plugin not found in this session.'
                      : 'Toggle the switch above to enable it.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-0 min-h-0 flex-1 overflow-hidden">
            <ResizablePanel defaultSize="16%" minSize="12%" maxSize="25%" className="flex flex-col border-r">
              <div className="border-b px-3 py-2 shrink-0">
                <span className="text-sm font-semibold">Nodes</span>
              </div>
              <NodePalette />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="57%" minSize="30%" className="min-w-0 overflow-hidden">
              <ShaderCanvas />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="27%" minSize="18%" maxSize="40%" className="flex flex-col border-l">
              <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
                <ResizablePanel defaultSize="35%" minSize="20%" className="flex flex-col overflow-hidden">
                  <div className="border-b px-3 py-2 shrink-0">
                    <span className="text-sm font-semibold">Inspector</span>
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <NodeInspector />
                  </ScrollArea>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize="65%" minSize="30%" className="flex flex-col overflow-hidden">
                  <CodePreview />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </ReactFlowProvider>
  );
}
