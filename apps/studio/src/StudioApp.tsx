import { BlendIcon, PlugZapIcon, SparklesIcon, WandSparklesIcon } from 'lucide-react';
import type { ElementType } from 'react';

import ParticleSystemPlayground from './tools/particle-system-playground';
import ShaderGraph from './tools/shader-graph';
import TextureLab from './tools/texture-lab';
import { useInspectorBridge } from './useInspectorBridge';
import { cn } from '@feather/ui';
import { STUDIO_TOOLS, useStudioUiStore, type StudioToolId } from './store/studio-ui';


/**
 * Feather Studio's shell.
 *
 * A frame, not a page. Studio is a workbench: the tool being used gets the whole
 * window below a compact rail, and the shell contributes no color of its own,
 * because the artifact someone is authoring is the only thing here that should
 * be colorful. See V4-STUDIO.md §5.
 *
 * This replaces the Phase 05b placeholder, which announced that the tools would
 * "move here in Phase 05c" while 25,500 lines of them sat unreferenced in
 * `tools/`. They had already moved; only the shell was missing.
 */

const TOOLS: Record<StudioToolId, { label: string; icon: ElementType; render: () => React.ReactNode }> = {
  'shader-graph': { label: 'Shader Graph', icon: BlendIcon, render: () => <ShaderGraph /> },
  'particle-playground': { label: 'Particles', icon: SparklesIcon, render: () => <ParticleSystemPlayground /> },
  'texture-lab': { label: 'Texture Lab', icon: WandSparklesIcon, render: () => <TextureLab /> },
};

/**
 * The Inspector connection, at the edge and styled as chrome.
 *
 * Not connected is a neutral fact, never an error: Studio is a local authoring
 * tool and a game is an addition to it (V4-STUDIO.md **P2**). Connecting stays
 * an explicit act — Studio never probes loopback on its own.
 */
function InspectorStatus() {
  const inspector = useInspectorBridge();

  const detail = inspector.connected
    ? inspector.session.connected
      ? (inspector.session.name ?? 'Game attached')
      : 'No game attached'
    : 'Local only';

  return (
    <div className="grid gap-1 border-t px-2 py-3" data-testid="studio-inspector-status">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span
          // Achromatic on purpose (§5 W1): connection is chrome, not state, and
          // colour beside a preview competes with the artifact. The semantic
          // ramps arrive in S5 and this still will not want one.
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            inspector.connected ? 'bg-foreground' : 'bg-muted-foreground/40',
          )}
        />
        <span className="truncate" title={detail}>
          {detail}
        </span>
      </div>

      {!inspector.connected && (
        <button
          type="button"
          onClick={() => void inspector.connect()}
          className="flex items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Connecting lets you push work straight into a running game. Studio works without it."
        >
          <PlugZapIcon className="size-3.5 shrink-0" />
          Connect Inspector
        </button>
      )}

      {inspector.error && (
        <p className="text-[11px] text-destructive" role="status">
          {inspector.error}
        </p>
      )}
    </div>
  );
}

export function StudioApp() {
  const activeTool = useStudioUiStore((state) => state.activeTool);
  const setActiveTool = useStudioUiStore((state) => state.setActiveTool);

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-background text-foreground">
      {/* The rail names where you are and gets out of the way. Studio has three
          tools; it does not need navigation furniture. */}
      <nav
        aria-label="Studio tools"
        data-testid="studio-rail"
        className="flex w-40 shrink-0 flex-col justify-between border-r bg-card"
      >
        <div className="grid gap-0.5 p-2">
          {STUDIO_TOOLS.map((id) => {
            const tool = TOOLS[id];
            const active = id === activeTool;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTool(id)}
                aria-current={active ? 'page' : undefined}
                data-testid={`studio-tool-${id}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                  active ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <tool.icon className="size-4 shrink-0" />
                <span className="truncate">{tool.label}</span>
              </button>
            );
          })}
        </div>

        <InspectorStatus />
      </nav>

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="studio-tool-surface">
        {TOOLS[activeTool].render()}
      </main>
    </div>
  );
}
