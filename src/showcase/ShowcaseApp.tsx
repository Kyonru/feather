import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { ShowcaseShaderGraph } from './ShowcaseShaderGraph';
import { ShowcaseParticlePlayground } from './ShowcaseParticlePlayground';
import { ShowcaseGallery } from './ShowcaseGallery';

type ShowcaseRoute = 'home' | 'shader-graph' | 'particle-system-playground';

function currentRoute(): ShowcaseRoute {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (path === 'shader-graph') return 'shader-graph';
  if (path === 'particle-system-playground') return 'particle-system-playground';
  return 'home';
}

function navigate(route: ShowcaseRoute) {
  const path = route === 'home' ? '/' : `/${route}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Home() {
  return (
    <main className="grid min-h-0 flex-1 place-items-center overflow-auto px-6 py-10">
      <div className="grid w-full max-w-5xl gap-8">
        <ShowcaseGallery />
        <section className="grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Feather Showcase</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight">
            A complete developer toolkit for LÖVE games.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Feather brings professional-grade tooling to LÖVE — visual shader authoring, particle editing, real-time
            debugging, performance profiling, log inspection, session replay, asset management, and more. All from an
            extensible and free development companion app, connected live to your running game.
          </p>
        </section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore the demos:</h3>
        <section className="grid gap-3 md:grid-cols-2">
          <button
            className="grid gap-3 rounded-md border bg-card p-5 text-left transition-colors hover:bg-muted/40"
            onClick={() => navigate('shader-graph')}
          >
            <span className="text-lg font-semibold">Shader Graph</span>
            <span className="text-sm text-muted-foreground">
              Build GLSL visually, write custom function nodes, upload textures, inspect generated shader source, and
              export editable graph files.
            </span>
          </button>
          <button
            className="grid gap-3 rounded-md border bg-card p-5 text-left transition-colors hover:bg-muted/40"
            onClick={() => navigate('particle-system-playground')}
          >
            <span className="text-lg font-semibold">Particle Playground</span>
            <span className="text-sm text-muted-foreground">
              Tune LÖVE particle systems from presets, edit motion and color curves, preview locally, and copy demo
              settings.
            </span>
          </button>
        </section>
      </div>
    </main>
  );
}

export function ShowcaseApp() {
  const [route, setRoute] = useState<ShowcaseRoute>(currentRoute);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const onInstallClick = () => {
    window.open('https://github.com/Kyonru/feather', '_blank');
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex flex-row items-center gap-2">
          <button className="flex items-center gap-2 text-sm font-semibold" onClick={() => navigate('home')}>
            <img src="/feather-clear.svg" alt="Feather" className="size-5" />
            Feather
          </button>
          <Button
            onClick={onInstallClick}
            variant="outline"
            className="hidden h-5 px-1.5 ml-2 text-[10px] md:inline-flex"
          >
            Install
          </Button>
        </div>
        <nav className="flex items-center gap-2">
          <Button
            size="sm"
            variant={route === 'shader-graph' ? 'default' : 'ghost'}
            className="h-8 text-xs"
            onClick={() => navigate('shader-graph')}
          >
            Shader Graph
          </Button>
          <Button
            size="sm"
            variant={route === 'particle-system-playground' ? 'default' : 'ghost'}
            className="h-8 text-xs"
            onClick={() => navigate('particle-system-playground')}
          >
            Particle Playground
          </Button>
        </nav>
      </header>
      {route === 'shader-graph' ? (
        <ShowcaseShaderGraph />
      ) : route === 'particle-system-playground' ? (
        <ShowcaseParticlePlayground />
      ) : (
        <Home />
      )}
      <Toaster richColors />
    </div>
  );
}
