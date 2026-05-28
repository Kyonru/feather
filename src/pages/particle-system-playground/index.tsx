import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { AlertTriangleIcon, FileWarningIcon, RotateCcwIcon, SparklesIcon, ZapIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePluginControl } from '@/hooks/use-plugin-control';
import { useParticleSystemPlayground } from '@/hooks/use-particle-system-playground';
import { CompositeSelector } from './components/CompositeSelector';
import { EmitterList } from './components/EmitterList';
import { ExportPanel } from './components/ExportPanel';
import { MovementPatternEditor } from './components/MovementPatternEditor';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ShaderEditor } from './components/ShaderEditor';
import { TextureImporter } from './components/TextureImporter';
import { ParticleNumberInput } from './components/ParticleNumberInput';
import { TimelinePanel } from './components/TimelinePanel';
import { isWeb } from '@/utils/platform';

const PROJECT_FILE_EXTENSION = 'featherparticles';

export type ParticleSystemPlaygroundController = ReturnType<typeof useParticleSystemPlayground>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-md border bg-card p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ParticleSystemPlaygroundPage({
  playgroundOverride,
  standalone = false,
  preview,
}: {
  playgroundOverride?: ParticleSystemPlaygroundController;
  standalone?: boolean;
  preview?: React.ReactNode;
} = {}) {
  const livePlayground = useParticleSystemPlayground();
  const playground = playgroundOverride ?? livePlayground;
  const pluginControl = usePluginControl('particle-system-playground');
  const composite = playground.composite;
  const system = playground.activeSystem;
  const isGameComposite = composite?.compositeType === 'game';
  const projectInputRef = useRef<HTMLInputElement>(null);

  const importProject = async () => {
    if (isWeb()) {
      projectInputRef.current?.click();
      return;
    }

    try {
      const path = await openDialog({
        filters: [{ name: 'Feather Particle Project', extensions: [PROJECT_FILE_EXTENSION] }],
        multiple: false,
      });
      if (!path || typeof path !== 'string') return;
      playground.importProject(await readTextFile(path));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import particle project');
    }
  };

  if (!playground.available) {
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

  if (!playground.enabled) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="grid max-w-md justify-items-center gap-3 text-center">
          <AlertTriangleIcon className="size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Particles Playground is disabled</h1>
          <p className="text-sm text-muted-foreground">
            {standalone
              ? 'The standalone showcase keeps this tool enabled with local sample data.'
              : 'Enable the built-in plugin for this session to author particle effects.'}
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
    <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] overflow-hidden">
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
      <aside className="flex min-h-0 flex-col border-r bg-muted/20">
        <CompositeSelector
          composites={playground.composites}
          activeComposite={playground.activeComposite}
          compositeType={composite?.compositeType}
          onSelect={playground.selectComposite}
          onCreate={playground.createComposite}
          onDelete={playground.deleteComposite}
        />
        <ScrollArea className="flex-1 min-h-0">
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

      <main className="flex  flex-1 min-h-0 max-h-[calc(100vh-4rem)] overflow-hidden">
        <ScrollArea>
          <div className="grid gap-3 p-4">
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
                    onClick={() => playground.emit(false)}
                  >
                    <ZapIcon className="size-4" />
                    Emit
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

            {preview}

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

                <Tabs defaultValue="emitter" className="gap-3">
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

                  <TabsContent value="emitter" className="mt-0">
                    <Section title="Emitter Properties">
                      <PropertiesPanel system={system} onChange={playground.updateActiveParam} />
                    </Section>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0">
                    <TimelinePanel
                      composite={composite}
                      activeSystemIndex={playground.activeSystemIndex}
                      isGameComposite={isGameComposite}
                      onSelectSystem={playground.selectSystem}
                      onTimelineChange={playground.updateTimeline}
                      onPlay={playground.playTimeline}
                      onPause={playground.pauseTimeline}
                      onStop={playground.stopTimeline}
                      onSeek={playground.seekTimeline}
                    />
                  </TabsContent>

                  <TabsContent value="preview-assets" className="mt-0">
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
