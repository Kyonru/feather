import { useHost } from '@feather/host';
import { AlertTriangleIcon, FileWarningIcon, PlayIcon, Redo2Icon, RotateCcwIcon, SparklesIcon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@feather/ui/button';
import { Checkbox } from '@feather/ui/checkbox';
import { Label } from '@feather/ui/label';
import { ScrollArea } from '@feather/ui/scroll-area';
import { Separator } from '@feather/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@feather/ui/tabs';
import { usePluginControl } from '@studio/session/plugin-control';
import { useParticleSystemPlayground } from '@studio/hooks/use-particle-system-playground';
import { useLocalParticlePlayground } from '@studio/tools/particle-system-playground/use-local-particle-playground';
import { useIsLocalMode, useSessionStore } from '@studio/session';
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

export type ParticleSystemPlaygroundController = ReturnType<typeof useParticleSystemPlayground>;

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

/**
 * A stable id for the local workspace, so work persists across restarts.
 *
 * Previously the id came from a "creative session", which Studio never creates,
 * so it was always `undefined` and every launch started from
 * `defaultLocalParticleData()`. S4 replaces this constant with real named
 * workspaces; until then it is what makes the tool remember anything at all.
 */
const LOCAL_WORKSPACE_ID = 'studio-local';

export default function ParticleSystemPlaygroundPage() {
  const host = useHost();
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  // Local is the default. This used to ask `isCreativeSession`, which is false
  // when no game is attached, so it selected the *live* controller in exactly
  // the situation Studio is normally in — see V4-STUDIO.md S3.
  const localMode = useIsLocalMode();
  const livePlayground = useParticleSystemPlayground();
  const localPlayground = useLocalParticlePlayground(localMode ? LOCAL_WORKSPACE_ID : activeSession?.id);
  const playground = localMode ? localPlayground : livePlayground;
  const pluginControl = usePluginControl('particle-system-playground');
  const composite = playground.composite;
  const system = playground.activeSystem;
  const isGameComposite = composite?.compositeType === 'game';
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [gamePreviewActive, setGamePreviewActive] = useState(false);
  const sendRuntimeTimeline = gamePreviewActive && !playground.runtimeSuspended;
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

  if (!localMode && !playground.available) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="grid max-w-md justify-items-center gap-3 text-center">
          <FileWarningIcon className="size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Particles Playground is not available in this session</h1>
          <p className="text-sm text-muted-foreground">
            Run with the bundled Feather plugins or update the game runtime.
          </p>
        </div>
      </div>
    );
  }

  if (!localMode && !playground.enabled) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="grid max-w-md justify-items-center gap-3 text-center">
          <AlertTriangleIcon className="size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Particles Playground is disabled</h1>
          <p className="text-sm text-muted-foreground">
            Enable the built-in plugin for this session to author particle effects.
          </p>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!!pluginControl.plugin?.incompatible}
            onClick={() => pluginControl.setEnabled(true)}
          >
            Enable Particles Playground
          </Button>
          {pluginControl.plugin?.incompatible && (
            <p className="text-xs text-muted-foreground">
              This plugin is incompatible with the current Feather runtime.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="particle-playground-root"
      className="grid h-0 min-h-0 w-full flex-1 grid-cols-[18rem_minmax(0,1fr)] overflow-hidden"
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
      <aside className="flex h-full min-h-0 flex-col bg-sidebar">
        <CompositeSelector
          composites={playground.composites}
          activeComposite={playground.activeComposite}
          compositeType={composite?.compositeType}
          onSelect={playground.selectComposite}
          onCreate={playground.createComposite}
          onDelete={playground.deleteComposite}
        />
        <ScrollArea className="h-0 min-h-0 flex-1">
          {composite ? (
            <EmitterList
              systems={composite.systems}
              activeIndex={playground.activeSystemIndex}
              isGameComposite={isGameComposite}
              onSelect={playground.selectSystem}
              onAdd={playground.addSystem}
              onRemove={playground.removeSystem}
              onReorder={playground.reorderSystem}
            />
          ) : (
            <div className="grid gap-3 p-4 text-sm text-muted-foreground">
              <SparklesIcon className="size-5" />
              <p>No composites yet.</p>
              <Button size="sm" className="h-8 text-xs" onClick={() => playground.createComposite()}>
                New Composite
              </Button>
            </div>
          )}
        </ScrollArea>
      </aside>

      <main className="flex h-full min-h-0 min-w-0 w-full overflow-hidden" data-testid="particle-playground-main">
        <ScrollArea className="h-full min-h-0 min-w-0 w-full">
          <div className="grid min-w-0 w-full gap-3 p-4" data-testid="particle-playground-content">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Particles Playground</h1>
                <p className="text-sm text-muted-foreground">
                  {playground.activeComposite ?? 'Create a composite'}{' '}
                  {isGameComposite ? 'game composite' : 'scratch composite'}
                </p>
              </div>
              {system && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    disabled={!playground.canUndo}
                    title={playground.historyUnavailableReason ?? 'Undo (Cmd/Ctrl+Z)'}
                    aria-label="Undo particle edit"
                    onClick={playground.undo}
                  >
                    <Undo2Icon className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    disabled={!playground.canRedo}
                    title={playground.historyUnavailableReason ?? 'Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)'}
                    aria-label="Redo particle edit"
                    onClick={playground.redo}
                  >
                    <Redo2Icon className="size-4" />
                  </Button>
                  <ExportPanel
                    onExportCode={playground.exportCode}
                    onExportZip={playground.exportZip}
                    onSaveProject={playground.saveProject}
                    onImportProject={() => void importProject()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-2 text-xs"
                    title="Play particle timeline"
                    onClick={() => playground.playTimeline(sendRuntimeTimeline)}
                  >
                    <PlayIcon className="size-4" />
                    Play
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-2 text-xs"
                    onClick={() => playground.reset(false)}
                  >
                    <RotateCcwIcon className="size-4" />
                    Reset
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={playground.kickStart}>
                    Kick Start
                  </Button>
                </div>
              )}
            </header>
            {!system || !composite ? (
              <div className="grid min-h-72 place-items-center rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
                <div className="grid justify-items-center gap-3">
                  <SparklesIcon className="size-7" />
                  <p>Create a scratch composite or register one from game code.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void importProject()}>
                      Import Project
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={() => playground.createComposite()}>
                      New Composite
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {isGameComposite && !system.exportReady && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    This game composite is editable, but export metadata is incomplete. Add texture/shader metadata or
                    import a texture before relying on ZIP export.
                  </div>
                )}

                <ParticlePreviewMonitor
                  playground={playground}
                  standalone={localMode}
                  isGameComposite={isGameComposite}
                  allowGamePreview={!localMode}
                  gamePreviewActive={gamePreviewActive}
                  onGamePreviewActiveChange={setGamePreviewActive}
                />

                <Tabs defaultValue="emitter" className="min-w-0 w-full gap-3">
                  <TabsList className="grid h-8 w-full grid-cols-3 rounded-md lg:w-fit lg:min-w-[27rem]">
                    <TabsTrigger value="emitter" className="text-xs">
                      Emitter
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="text-xs">
                      Timeline
                    </TabsTrigger>
                    <TabsTrigger value="preview-assets" className="text-xs">
                      Preview &amp; Assets
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="emitter" className="mt-0 min-w-0">
                    <Section title="Emitter Properties">
                      <PropertiesPanel system={system} onChange={playground.updateActiveParam} />
                    </Section>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0 min-w-0">
                    <TimelinePanel
                      composite={composite}
                      activeSystemIndex={playground.activeSystemIndex}
                      isGameComposite={isGameComposite}
                      onSelectSystem={playground.selectSystem}
                      onSystemEnabledChange={(index, enabled) => playground.updateSystemParam(index, 'enabled', enabled)}
                      onTimelineChange={playground.updateTimeline}
                      onPlay={() => playground.playTimeline(sendRuntimeTimeline)}
                      onPause={(time) => playground.pauseTimeline(time, sendRuntimeTimeline)}
                      onStop={() => playground.stopTimeline(sendRuntimeTimeline)}
                      onSeek={(time, immediate) => playground.seekTimeline(time, immediate, sendRuntimeTimeline)}
                    />
                  </TabsContent>

                  <TabsContent value="preview-assets" className="mt-0 min-w-0">
                    <div className="grid gap-3 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
                      <div className="grid content-start gap-3">
                        <Section title="Composite Preview">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="particle-preview-enabled"
                              checked={composite.previewEnabled}
                              disabled={isGameComposite}
                              onCheckedChange={(checked) => playground.updateParam('previewEnabled', checked === true)}
                            />
                            <Label htmlFor="particle-preview-enabled" className="text-xs">
                              Preview enabled
                            </Label>
                          </div>
                          <Separator />
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-[10px] text-muted-foreground">
                              X
                              <ParticleNumberInput
                                className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                                value={composite.x}
                                disabled={isGameComposite}
                                onValueChange={(value) => playground.updateParam('compositeX', value)}
                              />
                            </label>
                            <label className="grid gap-1 text-[10px] text-muted-foreground">
                              Y
                              <ParticleNumberInput
                                className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                                value={composite.y}
                                disabled={isGameComposite}
                                onValueChange={(value) => playground.updateParam('compositeY', value)}
                              />
                            </label>
                          </div>
                          <Separator />
                          <MovementPatternEditor
                            movement={composite.movement}
                            disabled={isGameComposite}
                            onChange={playground.updateParam}
                          />
                        </Section>

                        <Section title="Texture">
                          <TextureImporter
                            texturePath={system.texturePath}
                            texturePreset={system.texturePreset}
                            textureFilename={system.textureFilename}
                            onPreset={playground.setTexturePreset}
                            onPath={playground.setTexturePath}
                            onUpload={playground.setTextureFromUpload}
                          />
                        </Section>
                      </div>

                      <Section title="Shader">
                        <ShaderEditor
                          shaderPath={system.shaderPath}
                          shaderFilename={system.shaderFilename}
                          shaderSource={system.shaderSource}
                          error={playground.shaderError}
                          onApply={playground.setShader}
                        />
                      </Section>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
