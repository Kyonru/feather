import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MonitorOffIcon, MonitorPlayIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoveJsPreview } from '@/components/love-js-preview';
import { useSessionStore } from '@/store/session';
import type {
  ParticleSystemPlaygroundCompositeData,
  ParticleSystemPlaygroundSystem,
} from '@/types/particle-system-playground';

type PreviewStatus = 'idle' | 'sending' | 'live' | 'error';

type ParticlePreviewController = {
  enabled: boolean;
  activeComposite: string | null;
  activeSystem: ParticleSystemPlaygroundSystem | null;
  composite: ParticleSystemPlaygroundCompositeData | null;
  setRuntimePreviewActive: (active: boolean, composite?: string | null) => Promise<unknown>;
  playTimeline: (sendRuntime?: boolean) => void;
  seekTimeline: (time: number, immediate?: boolean, sendRuntime?: boolean) => void;
};

type Props = {
  playground: ParticlePreviewController;
  standalone: boolean;
  isGameComposite: boolean;
  gamePreviewActive: boolean;
  onGamePreviewActiveChange: (active: boolean) => void;
};

function gamePreviewDisabledReason(
  sessionId: string | null,
  activeComposite: string | null,
  composite: ParticleSystemPlaygroundCompositeData | null,
  isGameComposite: boolean,
) {
  if (!sessionId) return 'Connect a LÖVE session to preview in game';
  if (!activeComposite || !composite) return 'Create or select a scratch composite first';
  if (isGameComposite) return 'Game-owned composites are already drawn by the game';
  if (!composite.previewEnabled) return 'Enable composite preview before showing it in game';
  return undefined;
}

export function ParticlePreviewMonitor({
  playground,
  standalone,
  isGameComposite,
  gamePreviewActive,
  onGamePreviewActiveChange,
}: Props) {
  const sessionId = useSessionStore((state) => state.sessionId);
  const runtimeSuspended = useSessionStore((state) =>
    sessionId ? state.sessions[sessionId]?.runtimeSuspended === true : false,
  );
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const setRuntimePreviewActiveRef = useRef(playground.setRuntimePreviewActive);
  const activeGameCompositeRef = useRef<string | null>(null);
  const runtimeSuspendedRef = useRef(runtimeSuspended);
  const previewEnabled = playground.composite?.previewEnabled !== false;
  const disabledReason = gamePreviewDisabledReason(
    sessionId,
    playground.activeComposite,
    playground.composite,
    isGameComposite,
  );
  const suspendedStartReason = runtimeSuspended && !gamePreviewActive
    ? 'Resume Feather runtime before starting an in-game preview'
    : undefined;
  const effectiveDisabledReason = disabledReason ?? suspendedStartReason;
  const canShowInGame = !standalone && !effectiveDisabledReason;

  useEffect(() => {
    setRuntimePreviewActiveRef.current = playground.setRuntimePreviewActive;
  }, [playground.setRuntimePreviewActive]);

  const clearGamePreview = useCallback(async () => {
    const composite = activeGameCompositeRef.current ?? playground.activeComposite;
    if (!composite) {
      activeGameCompositeRef.current = null;
      onGamePreviewActiveChange(false);
      setStatus('idle');
      return;
    }
    setStatus('sending');
    try {
      await setRuntimePreviewActiveRef.current(false, composite);
      activeGameCompositeRef.current = null;
      onGamePreviewActiveChange(false);
      setError(null);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hide the connected-game preview.');
      setStatus('error');
    }
  }, [onGamePreviewActiveChange, playground.activeComposite]);

  useEffect(() => {
    return () => {
      const composite = activeGameCompositeRef.current;
      if (composite) void setRuntimePreviewActiveRef.current(false, composite);
    };
  }, []);

  useEffect(() => {
    if (standalone || !gamePreviewActive) return;
    if (!canShowInGame || !playground.activeComposite) {
      void clearGamePreview();
      return;
    }
    if (runtimeSuspended) return;
    if (activeGameCompositeRef.current === playground.activeComposite) return;
    activeGameCompositeRef.current = playground.activeComposite;
    void setRuntimePreviewActiveRef.current(true, playground.activeComposite);
  }, [canShowInGame, clearGamePreview, gamePreviewActive, playground.activeComposite, runtimeSuspended, standalone]);

  useEffect(() => {
    const wasSuspended = runtimeSuspendedRef.current;
    runtimeSuspendedRef.current = runtimeSuspended;
    if (!wasSuspended || runtimeSuspended || standalone || !gamePreviewActive || !canShowInGame || !playground.activeComposite) {
      return;
    }

    const composite = playground.activeComposite;
    activeGameCompositeRef.current = composite;
    setStatus('sending');
    void setRuntimePreviewActiveRef.current(true, composite)
      .then(() => {
        const timelineState = playground.composite?.timelineState;
        if (timelineState) {
          playground.seekTimeline(timelineState.time ?? 0, true, true);
          if (timelineState.playing) playground.playTimeline(true);
        }
        setError(null);
        setStatus('live');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to resume the connected-game preview.');
        setStatus('error');
      });
  }, [canShowInGame, gamePreviewActive, playground, runtimeSuspended, standalone]);

  const payload = useMemo(
    () => ({
      tool: previewEnabled && playground.composite ? 'particle-system-playground' : 'idle',
      activeComposite: playground.activeComposite,
      activeSystem: playground.activeSystem,
      composite: playground.composite,
    }),
    [playground.activeComposite, playground.activeSystem, playground.composite, previewEnabled],
  );

  async function toggleGamePreview() {
    if (gamePreviewActive) {
      await clearGamePreview();
      return;
    }
    if (!canShowInGame || !playground.activeComposite) return;
    setStatus('sending');
    setError(null);
    try {
      await playground.setRuntimePreviewActive(true, playground.activeComposite);
      const timelineState = playground.composite?.timelineState;
      if (timelineState) {
        playground.seekTimeline(timelineState.time ?? 0, true, true);
        if (timelineState.playing) playground.playTimeline(true);
      }
      activeGameCompositeRef.current = playground.activeComposite;
      onGamePreviewActiveChange(true);
      setStatus('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to show the connected-game preview.');
      setStatus('error');
    }
  }

  const description = previewEnabled
    ? 'Local love.js preview updates while you edit emitters, timeline clips, and assets.'
    : 'Local preview is paused for this scratch composite.';
  const footer = standalone
    ? 'This isolated love.js preview is local to the browser showcase.'
    : isGameComposite
      ? 'Game-owned composites are inspected and edited here, but the running game remains responsible for drawing them.'
      : error
        ? error
        : 'This local preview is cheap and isolated. Use Show in Game only when you want Feather to draw the scratch composite in the connected game.';

  const gamePreviewButton = (
    <Button
      size="sm"
      variant={gamePreviewActive ? 'destructive' : 'outline'}
      className={
        gamePreviewActive
          ? 'h-7 gap-1.5 text-xs'
          : 'h-7 gap-1.5 border-emerald-500/60 text-xs text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:border-emerald-400/50 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-200'
      }
      disabled={status === 'sending' || (!gamePreviewActive && !canShowInGame)}
      title={gamePreviewActive ? 'Hide the particle preview in the connected game' : effectiveDisabledReason}
      onClick={() => void toggleGamePreview()}
    >
      {gamePreviewActive ? <MonitorOffIcon className="size-3.5" /> : <MonitorPlayIcon className="size-3.5" />}
      {gamePreviewActive ? 'Hide in Game' : status === 'sending' ? 'Sending...' : 'Show in Game'}
    </Button>
  );

  if (!standalone) {
    const runtimeMessage = isGameComposite
      ? 'This composite is owned and drawn by the connected game.'
      : gamePreviewActive && runtimeSuspended
        ? 'Running from the last particle payload. Resume Feather to sync edits.'
        : gamePreviewActive
        ? 'Runtime preview is live in the connected game. Timeline and emitter edits sync while it stays enabled.'
        : 'Tauri uses the connected LÖVE runtime for particle preview right now. Nothing is drawn in the game until you choose Show in Game.';
    const statusMessage = error ?? effectiveDisabledReason ?? runtimeMessage;

    return (
      <section className="grid min-w-0 gap-3 rounded-md border bg-card p-3" data-testid="particle-preview-monitor">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Particle Preview</h2>
              <Badge variant={gamePreviewActive ? 'default' : 'secondary'} className="h-5 rounded-full px-2 text-[10px]">
                game runtime
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{runtimeMessage}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">{gamePreviewButton}</div>
        </div>
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{statusMessage}</div>
      </section>
    );
  }

  return (
    <LoveJsPreview
      floating
      title="Particle Preview"
      description={description}
      payload={payload}
      actions={null}
      footer={footer}
    />
  );
}
