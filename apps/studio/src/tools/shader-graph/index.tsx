import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { DownloadIcon, FolderOpenIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@feather/ui/badge';
import { useActiveSession, sessionSupportsRuntime } from '@studio/session';
import { useWorkspaceToolKey } from '@studio/store/studio-workspaces';
import { useHost } from '@feather/host';
import { Button } from '@feather/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@feather/ui/resizable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@feather/ui/select';
import { useShaderGraphStore } from '@studio/store/shader-graph';
import { NodePalette } from './NodePalette';
import { ShaderCanvas } from './ShaderCanvas';
import { ShaderRightPanel } from './ShaderRightPanel';
import { instantiateShaderGraphPreset, SHADER_GRAPH_PRESETS } from './presets';
import { diagnoseShaderGraph } from './diagnostics';
import { parseShaderGraphFile, type FeatherShaderGraphFile } from './file-format';

const FILE_VERSION = 3;
const FILE_EXTENSION = 'feathershgh';
const FIRST_OPEN_PRESET_ID = 'water-shimmer';

function defaultFilename(shaderName: string) {
  const base =
    shaderName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shader-graph';
  return `${base}.${FILE_EXTENSION}`;
}

export default function ShaderGraph() {
  const host = useHost();
  const activeSession = useActiveSession();
  const localMode = !sessionSupportsRuntime(activeSession);
  // The graph belongs to the Studio workspace, not to whichever game is
  // attached: keying it by session id made connecting swap the user's graph
  // for an empty one.
  const workspaceId = useWorkspaceToolKey('shaderGraph');
  const nodes = useShaderGraphStore((state) => state.nodes);
  const edges = useShaderGraphStore((state) => state.edges);
  const subgraphs = useShaderGraphStore((state) => state.subgraphs);
  const shaderName = useShaderGraphStore((state) => state.shaderName);
  const playgroundTarget = useShaderGraphStore((state) => state.playgroundTarget);
  const lastGeneratedGlsl = useShaderGraphStore((state) => state.lastGeneratedGlsl);
  const hasInitializedExample = useShaderGraphStore((state) => state.hasInitializedExample);
  const activeWorkspaceId = useShaderGraphStore((state) => state.activeWorkspaceId);
  const loadGraph = useShaderGraphStore((state) => state.loadGraph);
  const addNodesAndEdges = useShaderGraphStore((state) => state.addNodesAndEdges);
  const setSubgraphs = useShaderGraphStore((state) => state.setSubgraphs);
  const setActiveTemplateInstanceId = useShaderGraphStore((state) => state.setActiveTemplateInstanceId);
  const markClean = useShaderGraphStore((state) => state.markClean);
  const isDirty = useShaderGraphStore((state) => state.isDirty);
  const setHasInitializedExample = useShaderGraphStore((state) => state.setHasInitializedExample);
  const activateWorkspace = useShaderGraphStore((state) => state.activateWorkspace);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    activateWorkspace(workspaceId);
  }, [activateWorkspace, workspaceId]);

  useEffect(() => {
    if (activeWorkspaceId !== workspaceId) return;
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
  }, [activeWorkspaceId, edges.length, hasInitializedExample, loadGraph, nodes.length, playgroundTarget, setHasInitializedExample, workspaceId]);

  const importRaw = (raw: string) => {
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
      subgraphs,
      activeTemplateInstanceId: useShaderGraphStore.getState().activeTemplateInstanceId,
      lastGeneratedGlsl,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = defaultFilename(shaderName);

    const saved = await host.saveTextFile({
      defaultName: filename,
      filterName: 'Feather Shader Graph',
      extensions: [FILE_EXTENSION],
      text: json,
    });
    if (!saved) return;
    markClean();
    toast.success('Shader graph exported');
  };

  const importGraph = async () => {
    const file = await host.openTextFile({
      filterName: 'Feather Shader Graph',
      extensions: [FILE_EXTENSION],
      testId: 'shader-graph-import-input',
    });
    if (!file) return;
    importRaw(file.text);
  };

  const clearGraph = () => {
    if (nodes.length > 0 || edges.length > 0) {
      const confirmed = window.confirm('Clear the current shader graph? This removes all nodes and connections.');
      if (!confirmed) return;
    }
    loadGraph({
      nodes: [],
      edges: [],
      subgraphs: [],
      activeTemplateInstanceId: null,
      shaderName,
      playgroundTarget,
    });
    toast.success('Shader graph cleared');
  };

  const loadPreset = (presetId: string) => {
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
  };

  const insertPreset = (presetId: string) => {
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
            {/* Mode, stated as chrome. A connection adds live preview; the
                editor is the same either way (V4.md §6.4, P1/P2). Plugin
                state lives in Inspector, which is where it is toggled. */}
            <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]" data-testid="shader-graph-mode">
              {localMode ? 'Local' : `Live preview · ${activeSession?.name ?? 'game'}`}
            </Badge>
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
            <ShaderRightPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ReactFlowProvider>
  );
}
