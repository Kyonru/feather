import { useState } from 'react';
import { BlendIcon, MenuIcon, PlugZapIcon, SparklesIcon, UnplugIcon, WandSparklesIcon } from 'lucide-react';
import type { ElementType } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@feather/ui/sheet';
import { cn } from '@feather/ui';

import ParticleSystemPlayground from './tools/particle-system-playground';
import ShaderGraph from './tools/shader-graph';
import TextureLab from './tools/texture-lab';
import { useInspectorBridge } from './useInspectorBridge';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { STUDIO_TOOLS, useStudioUiStore, type StudioToolId } from './store/studio-ui';

/**
 * Feather Studio's shell.
 *
 * A frame, not a page. The tool being used owns everything below a thin strip,
 * and the shell contributes no color of its own, because the artifact someone is
 * authoring is the only thing here that should be colorful. See V4.md §6.4.
 *
 * **Regions are separated by background value, not borders.** A border is a line
 * you have to look at; a half-step of value does the same job and stops
 * registering once you no longer need it. This is the VS Code approach and it
 * suits a workbench better than drawn edges — the eye should spend its contrast
 * budget on the work.
 *
 * **Navigation overlays rather than occupying.** Three tools is not enough to
 * justify a permanent rail eating width that a node graph or a texture preview
 * would rather have. The strip keeps you oriented — which tool, is a game
 * attached — and the menu appears over the work only when asked for.
 */

const TOOLS: Record<StudioToolId, { label: string; icon: ElementType; render: () => React.ReactNode }> = {
  'shader-graph': { label: 'Shader Graph', icon: BlendIcon, render: () => <ShaderGraph /> },
  'particle-playground': { label: 'Particles', icon: SparklesIcon, render: () => <ParticleSystemPlayground /> },
  'texture-lab': { label: 'Texture Lab', icon: WandSparklesIcon, render: () => <TextureLab /> },
};

function sessionLabel(session: { id: string; name: string | null }): string {
  return session.name ?? `Game ${session.id.slice(0, 8)}`;
}

function connectedTime(connectedAt: number): string {
  return connectedAt > 0
    ? new Date(connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';
}

/**
 * The Inspector connection.
 *
 * Not connected is a neutral fact, never an error: Studio is a local authoring
 * tool and a game is an addition to it (V4.md **Studio P2**). The dot is
 * achromatic for the same reason the rest of the shell is — connection is
 * chrome, not state, and color near a preview competes with the artifact.
 *
 * With several games attached to Inspector the user picks one; Studio never
 * guesses, because a guess is how a preview lands in the wrong game.
 */
function InspectorStatus({ compact = false }: { compact?: boolean }) {
  const inspector = useInspectorBridge();
  const selected = inspector.selectedSession;

  const detail =
    inspector.status === 'connecting'
      ? 'Connecting…'
      : !inspector.connected
        ? 'Local only'
        : selected
          ? sessionLabel(selected)
          : inspector.sessions.length > 0
            ? 'Choose a game'
            : 'No game attached';

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        data-testid="studio-inspector-status"
        title={
          inspector.connected
            ? `Feather Inspector · ${detail}`
            : (inspector.notice ?? 'Studio works as a local editor. Connecting adds live preview in a game.')
        }
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', selected ? 'bg-foreground' : 'bg-muted-foreground/40')}
        />
        <span className="truncate">{detail}</span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 px-3 py-3" data-testid="studio-inspector-detail">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Game</p>
      <p className="text-xs">{detail}</p>

      {inspector.connected && inspector.sessions.length > 0 && (
        <div role="radiogroup" aria-label="Game to preview in" className="grid gap-0.5" data-testid="studio-session-picker">
          {inspector.sessions.map((session) => {
            const checked = session.id === inspector.selectedSessionId;
            return (
              <button
                key={session.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => void inspector.selectSession(session.id)}
                className={cn(
                  'flex items-baseline justify-between gap-2 rounded-sm border-l-2 px-2 py-1.5 text-left text-xs',
                  checked
                    ? 'border-l-primary bg-accent/60 text-foreground'
                    : 'border-l-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                )}
              >
                <span className="truncate">{sessionLabel(session)}</span>
                <span className="shrink-0 text-[10px] tabular-nums">{connectedTime(session.connectedAt)}</span>
              </button>
            );
          })}
        </div>
      )}

      {inspector.connected ? (
        <button
          type="button"
          onClick={() => void inspector.disconnect()}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <UnplugIcon className="size-3.5 shrink-0" />
          Disconnect Inspector
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={inspector.status === 'connecting'}
            onClick={() => void inspector.connect()}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <PlugZapIcon className="size-3.5 shrink-0" />
            Connect Inspector
          </button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Optional. Studio works as a local editor without it; connecting lets you push work straight into a running
            game.
          </p>
        </>
      )}

      {(inspector.error ?? inspector.notice) && (
        // Muted, not destructive: an absent Inspector costs the user nothing
        // they were working on, so it is not styled as danger (P2).
        <p className="text-[11px] leading-relaxed text-muted-foreground" role="status" data-testid="studio-inspector-message">
          {inspector.error ?? inspector.notice}
        </p>
      )}
    </div>
  );
}

function ToolMenu({ activeTool, onSelect }: { activeTool: StudioToolId; onSelect: (tool: StudioToolId) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-testid="studio-menu-trigger"
        aria-label="Studio tools"
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MenuIcon className="size-4" />
      </SheetTrigger>

      <SheetContent side="left" className="w-64 gap-0 border-r-0 p-0 sm:max-w-64" data-testid="studio-menu">
        <SheetTitle className="px-3 pt-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Feather Studio
        </SheetTitle>
        <SheetDescription className="sr-only">
          Choose a creative tool or connect Studio to a game through Feather Inspector.
        </SheetDescription>

        <nav aria-label="Studio tools" className="grid gap-0.5 p-2">
          {STUDIO_TOOLS.map((id) => {
            const tool = TOOLS[id];
            const active = id === activeTool;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelect(id);
                  setOpen(false);
                }}
                aria-current={active ? 'page' : undefined}
                data-testid={`studio-tool-${id}`}
                className={cn(
                  // The active marker is a left bar and a value step, the way an
                  // editor marks its current file — no filled pill, no accent
                  // wash. It reads at a glance and stops registering when you
                  // are not looking for it.
                  'flex items-center gap-2.5 rounded-sm border-l-2 px-2.5 py-2 text-left text-xs transition-colors',
                  active
                    ? 'border-l-primary bg-accent/60 font-medium text-foreground'
                    : 'border-l-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                )}
              >
                <tool.icon className="size-4 shrink-0" />
                <span className="truncate">{tool.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          <InspectorStatus />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StudioApp() {
  const activeTool = useStudioUiStore((state) => state.activeTool);
  const setActiveTool = useStudioUiStore((state) => state.setActiveTool);

  return (
    <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      {/* One value step above the work, and no rule between them. Thin, because
          the canvas wants the height as much as the width. */}
      <header data-testid="studio-strip" className="flex h-9 shrink-0 items-center gap-2 bg-sidebar px-2 text-xs">
        <ToolMenu activeTool={activeTool} onSelect={setActiveTool} />
        <span className="truncate font-medium" data-testid="studio-current-tool">
          {TOOLS[activeTool].label}
        </span>
        <span className="text-muted-foreground/50" aria-hidden>
          /
        </span>
        <WorkspaceSwitcher />
        <div className="ml-auto flex items-center gap-3">
          <InspectorStatus compact />
        </div>
      </header>

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="studio-tool-surface">
        {TOOLS[activeTool].render()}
      </main>
    </div>
  );
}
