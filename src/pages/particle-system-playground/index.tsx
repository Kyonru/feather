import { AlertTriangleIcon, FileWarningIcon, RotateCcwIcon, SparklesIcon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useParticleSystemPlayground } from '@/hooks/use-particle-system-playground';
import { CompositeSelector } from './components/CompositeSelector';
import { EmitterList } from './components/EmitterList';
import { ExportPanel } from './components/ExportPanel';
import { MovementPatternEditor } from './components/MovementPatternEditor';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ShaderEditor } from './components/ShaderEditor';
import { TextureImporter } from './components/TextureImporter';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-md border bg-card p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ParticleSystemPlaygroundPage() {
  const playground = useParticleSystemPlayground();
  const composite = playground.composite;
  const system = playground.activeSystem;
  const isGameComposite = composite?.compositeType === 'game';

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
            Enable the built-in plugin for this session to author particle effects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 border-r bg-muted/20">
        <CompositeSelector
          composites={playground.composites}
          activeComposite={playground.activeComposite}
          compositeType={composite?.compositeType}
          onSelect={playground.selectComposite}
          onCreate={playground.createComposite}
          onDelete={playground.deleteComposite}
        />
        <ScrollArea className="h-[calc(100vh-9rem)]">
          {composite ? (
            <EmitterList
              systems={composite.systems}
              activeIndex={playground.activeSystemIndex}
              isGameComposite={isGameComposite}
              onSelect={playground.selectSystem}
              onAdd={playground.addSystem}
              onRemove={playground.removeSystem}
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

      <main className="min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
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
                <div className="flex gap-2">
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

            {!system || !composite ? (
              <div className="grid min-h-72 place-items-center rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
                <div className="grid justify-items-center gap-3">
                  <SparklesIcon className="size-7" />
                  <p>Create a scratch composite or register one from game code.</p>
                  <Button size="sm" className="h-8 text-xs" onClick={() => playground.createComposite()}>
                    New Composite
                  </Button>
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

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <Section title="Emitter Properties">
                    <PropertiesPanel system={system} onChange={playground.updateActiveParam} />
                  </Section>

                  <div className="grid content-start gap-3">
                    <Section title="Composite Preview">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-[10px] text-muted-foreground">
                          X
                          <input
                            className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                            type="number"
                            value={composite.x}
                            disabled={isGameComposite}
                            onChange={(event) => playground.updateParam('compositeX', Number(event.target.value))}
                          />
                        </label>
                        <label className="grid gap-1 text-[10px] text-muted-foreground">
                          Y
                          <input
                            className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                            type="number"
                            value={composite.y}
                            disabled={isGameComposite}
                            onChange={(event) => playground.updateParam('compositeY', Number(event.target.value))}
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

                    <Section title="Shader">
                      <ShaderEditor
                        shaderPath={system.shaderPath}
                        shaderFilename={system.shaderFilename}
                        shaderSource={system.shaderSource}
                        error={playground.shaderError}
                        onApply={playground.setShader}
                      />
                    </Section>

                    <Section title="Export">
                      <ExportPanel onExportCode={playground.exportCode} onExportZip={playground.exportZip} />
                    </Section>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
