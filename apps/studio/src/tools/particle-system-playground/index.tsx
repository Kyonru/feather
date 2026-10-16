import { useHost } from '@feather/host';
import { PlayIcon, Redo2Icon, RotateCcwIcon, SparklesIcon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@feather/ui/button';
import { Checkbox } from '@feather/ui/checkbox';
import { Label } from '@feather/ui/label';
import { ScrollArea } from '@feather/ui/scroll-area';
import { Separator } from '@feather/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@feather/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@feather/ui/resizable';
import { useLocalParticlePlayground } from '@studio/tools/particle-system-playground/use-local-particle-playground';
import { useWorkspaceToolKey } from '@studio/store/studio-workspaces';
import { usePersistedPanelLayout } from '@studio/hooks/use-persisted-panel-layout';
import { CompositeSelector } from './components/CompositeSelector';
import { EmitterList } from './components/EmitterList';
import { ExportPanel } from './components/ExportPanel';
import { MovementPatternEditor } from './components/MovementPatternEditor';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ShaderEditor } from './components/ShaderEditor';
import { TextureImporter } from './components/TextureImporter';
import { ParticleNumberInput } from './components/ParticleNumberInput';
import { ParticlePreviewMonitor } from './components/ParticlePreviewMonitor';
import { TimelinePanel } from './components/TimelinePanel';

const PROJECT_FILE_EXTENSION = 'featherparticles';
const PARTICLE_PANEL_IDS = ['particle-selection', 'particle-preview', 'particle-inspector'] as const;
const PARTICLE_PREVIEW_PANEL_IDS = ['particle-canvas', 'particle-timeline'] as const;

export type ParticleSystemPlaygroundController = ReturnType<typeof useLocalParticlePlayground>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // A card inside a tool that already owns the window is Inspector's idiom:
    // there, cards separated peers on a scrolling page. Here the section is
    // already inside its own region, so the outline is a line with nothing to
    // do. A value step and a quiet heading carry the grouping instead.
    <section className="grid gap-2.5 rounded-sm bg-card/60 p-3">
      <h2 className="section-label">{title}</h2>
      {children}
    </section>
  );
}

function targetIsTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target.isContentEditable;
}

export default function ParticleSystemPlaygroundPage() {
  const host = useHost();
  // The work is always the local workspace's. Attaching a game used to swap in
  // a game-owned controller, which in Studio has no read-back from the game —
  // so connecting replaced the user's composites with an empty "not available"
  // screen. Connecting adds; it does not replace (V4.md §6.4, P2).
  const workspaceKey = useWorkspaceToolKey('particles');
  const playground = useLocalParticlePlayground(workspaceKey);
  const composite = playground.composite;
  const system = playground.activeSystem;
  const isGameComposite = composite?.compositeType === 'game';
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [gamePreviewActive, setGamePreviewActive] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const workbenchLayout = usePersistedPanelLayout('particles', PARTICLE_PANEL_IDS);
  const previewLayout = usePersistedPanelLayout('particles-preview', PARTICLE_PREVIEW_PANEL_IDS);
  // The viewport measuring that used to live here existed for one situation:
  // this tool embedded in an Inspector page, where it had to size itself to the
  // window minus the surrounding chrome. In Studio the tool owns the window and
  // fills its container, so the measurement, the resize listener and the
  // explicit pixel height are all gone.

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (targetIsTextInput(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (!modifier) return;
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          playground.redo();
        } else {
          playground.undo();
        }
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        playground.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playground]);

  const importProject = async () => {
    try {
      const file = await host.openTextFile({
        filterName: 'Feather Particle Project',
        extensions: [PROJECT_FILE_EXTENSION],
        testId: 'particle-project-import-input',
      });
      if (!file) return;
      playground.importProject(file.text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import particle project');
    }
  };

  return (
    <div
      data-testid="particle-playground-root"
      className="flex h-0 min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <input
        ref={projectInputRef}
        type="file"
        accept={`.${PROJECT_FILE_EXTENSION},application/json`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          file
            .text()
            .then(playground.importProject)
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : 'Failed to import particle project');
            });
        }}
      />
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 bg-sidebar px-3 py-2" data-testid="particle-workbench-header">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-sm font-semibold">Particles Playground</h1>
          <p className="truncate text-[10px] text-muted-foreground">
            {playground.activeComposite ?? 'Create a composite'} · {isGameComposite ? 'game composite' : 'local composite'}
          </p>
        </div>
        {system && (
          <>
            <Button size="icon" variant="ghost" className="size-8" disabled={!playground.canUndo} title={playground.historyUnavailableReason ?? 'Undo (Cmd/Ctrl+Z)'} aria-label="Undo particle edit" onClick={playground.undo}>
              <Undo2Icon className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" disabled={!playground.canRedo} title={playground.historyUnavailableReason ?? 'Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)'} aria-label="Redo particle edit" onClick={playground.redo}>
              <Redo2Icon className="size-4" />
            </Button>
            <ExportPanel onExportCode={playground.exportCode} onExportZip={playground.exportZip} onSaveProject={playground.saveProject} onImportProject={() => void importProject()} />
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" title="Play particle timeline" onClick={() => playground.playTimeline()}>
              <PlayIcon className="size-3.5" /> Play
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => playground.reset()}>
              <RotateCcwIcon className="size-3.5" /> Reset
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={playground.kickStart}>Kick Start</Button>
          </>
        )}
      </header>

      <ResizablePanelGroup
        id="studio-particle-workbench"
        orientation="horizontal"
        className="h-0 min-h-0 flex-1 overflow-hidden"
        defaultLayout={workbenchLayout.defaultLayout}
        onLayoutChanged={workbenchLayout.onLayoutChanged}
        data-testid="particle-workbench"
      >
        <ResizablePanel id="particle-selection" defaultSize="18%" minSize="14%" maxSize="20%" className="flex min-h-0 flex-col bg-sidebar">
          <CompositeSelector composites={playground.composites} activeComposite={playground.activeComposite} compositeType={composite?.compositeType} onSelect={playground.selectComposite} onCreate={playground.createComposite} onDelete={playground.deleteComposite} />
          <ScrollArea className="h-0 min-h-0 flex-1">
            {composite ? (
              <EmitterList systems={composite.systems} activeIndex={playground.activeSystemIndex} isGameComposite={isGameComposite} onSelect={playground.selectSystem} onAdd={playground.addSystem} onRemove={playground.removeSystem} onReorder={playground.reorderSystem} />
            ) : (
              <div className="grid gap-3 p-4 text-sm text-muted-foreground"><SparklesIcon className="size-5" /><p>No composites yet.</p><Button size="sm" className="h-8 text-xs" onClick={() => playground.createComposite()}>New Composite</Button></div>
            )}
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle className="bg-border/40" />

        <ResizablePanel id="particle-preview" defaultSize="52%" minSize="50%" className="min-h-0 min-w-0 bg-background">
          <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-testid="particle-playground-main">
            {!system || !composite ? (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
                <div className="grid max-w-sm justify-items-center gap-3"><SparklesIcon className="size-7" /><p>Create a scratch composite or register one from game code.</p><div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void importProject()}>Import Project</Button><Button size="sm" className="h-8 text-xs" onClick={() => playground.createComposite()}>New Composite</Button></div></div>
              </div>
            ) : (
              <>
                {isGameComposite && !system.exportReady && <div className="shrink-0 border-b border-warn-border bg-warn-surface px-3 py-2 text-xs text-warn">This game composite is editable, but export metadata is incomplete. Add texture/shader metadata or import a texture before relying on ZIP export.</div>}
                <div className="flex h-9 shrink-0 items-center justify-between bg-card px-3">
                  <span className="section-label">Simulation Preview</span>
                  <Button size="sm" variant={timelineOpen ? 'secondary' : 'ghost'} className="h-7 text-[10px]" role="tab" aria-selected={timelineOpen} aria-expanded={timelineOpen} onClick={() => setTimelineOpen((open) => !open)}>
                    Timeline
                  </Button>
                </div>
                {timelineOpen ? (
                  <ResizablePanelGroup id="studio-particle-preview-stack" orientation="vertical" className="h-0 min-h-0 flex-1" defaultLayout={previewLayout.defaultLayout} onLayoutChanged={previewLayout.onLayoutChanged}>
                    <ResizablePanel id="particle-canvas" defaultSize="38%" minSize="26%" className="min-h-0 overflow-hidden">
                      <ParticlePreviewMonitor playground={playground} standalone isGameComposite={isGameComposite} allowGamePreview={false} gamePreviewActive={gamePreviewActive} onGamePreviewActiveChange={setGamePreviewActive} />
                    </ResizablePanel>
                    <ResizableHandle className="bg-border/40" />
                    <ResizablePanel id="particle-timeline" defaultSize="62%" minSize="40%" className="min-h-0 overflow-auto bg-card p-2">
                      <TimelinePanel composite={composite} activeSystemIndex={playground.activeSystemIndex} isGameComposite={isGameComposite} onSelectSystem={playground.selectSystem} onSystemEnabledChange={(index, enabled) => playground.updateSystemParam(index, 'enabled', enabled)} onTimelineChange={playground.updateTimeline} onPlay={() => playground.playTimeline()} onPause={(time) => playground.pauseTimeline(time)} onStop={() => playground.stopTimeline()} onSeek={(time) => playground.seekTimeline(time)} />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : (
                  <div className="h-0 min-h-0 flex-1 overflow-hidden"><ParticlePreviewMonitor playground={playground} standalone isGameComposite={isGameComposite} allowGamePreview={false} gamePreviewActive={gamePreviewActive} onGamePreviewActiveChange={setGamePreviewActive} /></div>
                )}
              </>
            )}
          </main>
        </ResizablePanel>

        <ResizableHandle className="bg-border/40" />

        <ResizablePanel id="particle-inspector" defaultSize="30%" minSize="22%" maxSize="30%" className="min-h-0 min-w-0 bg-card">
          {system && composite ? (
            <Tabs defaultValue="emitter" className="flex h-full min-h-0 min-w-0 flex-col gap-0">
              <TabsList className="m-2 grid h-8 shrink-0 grid-cols-2 rounded-sm">
                <TabsTrigger value="emitter" className="text-xs">Emitter</TabsTrigger>
                <TabsTrigger value="preview-assets" className="text-xs">Preview &amp; Assets</TabsTrigger>
              </TabsList>
              <TabsContent value="emitter" className="mt-0 h-0 min-h-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full"><div className="p-3"><PropertiesPanel system={system} onChange={playground.updateActiveParam} /></div></ScrollArea>
              </TabsContent>
              <TabsContent value="preview-assets" className="mt-0 h-0 min-h-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full"><div className="grid content-start gap-3 p-3" data-testid="particle-playground-content">
                  <Section title="Composite Preview">
                    <div className="flex items-center gap-2"><Checkbox id="particle-preview-enabled" checked={composite.previewEnabled} disabled={isGameComposite} onCheckedChange={(checked) => playground.updateParam('previewEnabled', checked === true)} /><Label htmlFor="particle-preview-enabled" className="text-xs">Preview enabled</Label></div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[10px] text-muted-foreground">X<ParticleNumberInput className="h-8 rounded border bg-background px-2 text-xs text-foreground" value={composite.x} disabled={isGameComposite} onValueChange={(value) => playground.updateParam('compositeX', value)} /></label><label className="grid gap-1 text-[10px] text-muted-foreground">Y<ParticleNumberInput className="h-8 rounded border bg-background px-2 text-xs text-foreground" value={composite.y} disabled={isGameComposite} onValueChange={(value) => playground.updateParam('compositeY', value)} /></label></div>
                    <Separator />
                    <MovementPatternEditor movement={composite.movement} disabled={isGameComposite} onChange={playground.updateParam} />
                  </Section>
                  <Section title="Texture"><TextureImporter texturePath={system.texturePath} texturePreset={system.texturePreset} textureFilename={system.textureFilename} onPreset={playground.setTexturePreset} onPath={playground.setTexturePath} onUpload={playground.setTextureFromUpload} /></Section>
                  <Section title="Shader"><ShaderEditor shaderPath={system.shaderPath} shaderFilename={system.shaderFilename} shaderSource={system.shaderSource} error={playground.shaderError} onApply={playground.setShader} /></Section>
                </div></ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="grid h-full place-items-center p-5 text-center text-xs text-muted-foreground">Select or create an emitter to edit its properties.</div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
