import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MonitorOffIcon, MonitorPlayIcon, RefreshCwIcon } from 'lucide-react';
import { Badge } from '@feather/ui/badge';
import { Button } from '@feather/ui/button';
import { LoveJsPreview } from '@studio/components/love-js-preview';
import { PreviewGroundControl, usePreviewGround } from '@studio/components/PreviewGroundControl';
import { sessionSupportsRuntime, useSessionStore } from '@studio/session';
import type {
  ParticleSystemPlaygroundCompositeData,
  ParticleSystemPlaygroundSystem,
} from '@studio/types/particle-system-playground';

type PreviewStatus = 'idle' | 'sending' | 'live' | 'error';

type ParticlePreviewController = {
  enabled: boolean;
  activeComposite: string | null;
  activeSystem: ParticleSystemPlaygroundSystem | null;
  composite: ParticleSystemPlaygroundCompositeData | null;
  setRuntimePreviewActive: (active: boolean, composite?: string | null, exact?: boolean) => Promise<unknown>;
  playTimeline: (sendRuntime?: boolean) => void;
  seekTimeline: (time: number, immediate?: boolean, sendRuntime?: boolean) => void;
};

type Props = {
  playground: ParticlePreviewController;
  standalone: boolean;
  isGameComposite: boolean;
  allowGamePreview?: boolean;
  gamePreviewActive: boolean;
  onGamePreviewActiveChange: (active: boolean) => void;
};

function particlePreviewSnapshot(composite: ParticleSystemPlaygroundCompositeData | null): string {
  if (!composite) return '';
  const { timelineState: _timelineState, movement, ...authoringData } = composite;
  return JSON.stringify({
    ...authoringData,
    movement: movement ? { ...movement, t: undefined } : movement,
  });
}

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
  allowGamePreview = true,
  gamePreviewActive,
  onGamePreviewActiveChange,
}: Props) {
  const sessionId = useSessionStore((state) => state.sessionId);
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  const runtimeSessionId = allowGamePreview && sessionSupportsRuntime(activeSession) ? sessionId : null;
  const runtimeSuspended = useSessionStore((state) =>
    runtimeSessionId ? state.sessions[runtimeSessionId]?.runtimeSuspended === true : false,
  );
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [syncedSnapshot, setSyncedSnapshot] = useState('');
  const [previewGround, setPreviewGround] = usePreviewGround('particles');
  const setRuntimePreviewActiveRef = useRef(playground.setRuntimePreviewActive);
  const activeGameCompositeRef = useRef<string | null>(null);
  const runtimeSuspendedRef = useRef(runtimeSuspended);
  const previewEnabled = playground.composite?.previewEnabled !== false;
  const currentPreviewSnapshot = useMemo(() => particlePreviewSnapshot(playground.composite), [playground.composite]);
  const previewOutOfDate = gamePreviewActive && currentPreviewSnapshot !== syncedSnapshot;
  const disabledReason = gamePreviewDisabledReason(
    runtimeSessionId,
    playground.activeComposite,
    playground.composite,
    isGameComposite,
  );
  const suspendedStartReason = runtimeSuspended && !gamePreviewActive
    ? 'Resume Feather runtime before starting an in-game preview'
    : undefined;
  const effectiveDisabledReason = disabledReason ?? suspendedStartReason;
  const canShowInGame = !standalone && allowGamePreview && !effectiveDisabledReason;

  useEffect(() => {
    setRuntimePreviewActiveRef.current = playground.setRuntimePreviewActive;
  }, [playground.setRuntimePreviewActive]);

  const clearGamePreview = useCallback(async () => {
    const composite = activeGameCompositeRef.current ?? playground.activeComposite;
    if (!composite) {
      activeGameCompositeRef.current = null;
      setSyncedSnapshot('');
      onGamePreviewActiveChange(false);
      setStatus('idle');
      return;
    }
    setStatus('sending');
    try {
      await setRuntimePreviewActiveRef.current(false, composite);
      activeGameCompositeRef.current = null;
      setSyncedSnapshot('');
      onGamePreviewActiveChange(false);
      setError(null);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not hide the preview in the game. It may have disconnected — check it is still running.');
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
    const composite = playground.activeComposite;
    setStatus('sending');
    setError(null);
    void setRuntimePreviewActiveRef.current(true, composite, true)
      .then(() => {
        activeGameCompositeRef.current = composite;
        setSyncedSnapshot(currentPreviewSnapshot);
        setStatus('live');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not switch the preview in the game. It may have disconnected — check it is still running.');
        setStatus('error');
      });
  }, [canShowInGame, clearGamePreview, currentPreviewSnapshot, gamePreviewActive, playground.activeComposite, runtimeSuspended, standalone]);

  useEffect(() => {
    const composite = playground.activeComposite;
    if (
      standalone || !gamePreviewActive || !canShowInGame || runtimeSuspended || !composite ||
      activeGameCompositeRef.current !== composite || currentPreviewSnapshot === syncedSnapshot
    ) return;

    const timeoutId = window.setTimeout(() => {
      setStatus('sending');
      setError(null);
      void setRuntimePreviewActiveRef.current(true, composite, true)
        .then(() => {
          activeGameCompositeRef.current = composite;
          setSyncedSnapshot(currentPreviewSnapshot);
          setStatus('live');
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not sync particle edits to the game. Refresh to retry.');
          setStatus('error');
        });
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [canShowInGame, currentPreviewSnapshot, gamePreviewActive, playground.activeComposite, runtimeSuspended, standalone, syncedSnapshot]);

  useEffect(() => {
    const wasSuspended = runtimeSuspendedRef.current;
    runtimeSuspendedRef.current = runtimeSuspended;
    if (!wasSuspended || runtimeSuspended || standalone || !gamePreviewActive || !canShowInGame || !playground.activeComposite) {
      return;
    }

    const composite = playground.activeComposite;
    setStatus('sending');
    void setRuntimePreviewActiveRef.current(true, composite, true)
      .then(() => {
        activeGameCompositeRef.current = composite;
        setSyncedSnapshot(currentPreviewSnapshot);
        const timelineState = playground.composite?.timelineState;
        if (timelineState) {
          playground.seekTimeline(timelineState.time ?? 0, true, true);
          if (timelineState.playing) playground.playTimeline(true);
        }
        setError(null);
        setStatus('live');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not resume the preview in the game. It may have disconnected — check it is still running.');
        setStatus('error');
      });
  }, [canShowInGame, currentPreviewSnapshot, gamePreviewActive, playground, runtimeSuspended, standalone]);

  const payload = useMemo(
    () => ({
      tool: previewEnabled && playground.composite ? 'particle-system-playground' : 'idle',
      activeComposite: playground.activeComposite,
      activeSystem: playground.activeSystem,
      composite: playground.composite,
      previewGround,
    }),
    [playground.activeComposite, playground.activeSystem, playground.composite, previewEnabled, previewGround],
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
      await playground.setRuntimePreviewActive(true, playground.activeComposite, true);
      const timelineState = playground.composite?.timelineState;
      if (timelineState) {
        playground.seekTimeline(timelineState.time ?? 0, true, true);
        if (timelineState.playing) playground.playTimeline(true);
      }
      activeGameCompositeRef.current = playground.activeComposite;
      setSyncedSnapshot(currentPreviewSnapshot);
      onGamePreviewActiveChange(true);
      setStatus('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not show the preview in the game. It may have disconnected — check it is still running.');
      setStatus('error');
    }
  }

  async function refreshGamePreview() {
    const composite = playground.activeComposite;
    if (!composite || !canShowInGame || runtimeSuspended) return;
    setStatus('sending');
    setError(null);
    try {
      await playground.setRuntimePreviewActive(true, composite, true);
      activeGameCompositeRef.current = composite;
      setSyncedSnapshot(currentPreviewSnapshot);
      setStatus('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync particle edits to the game. Refresh to retry.');
      setStatus('error');
    }
  }

  const description = previewEnabled
    ? 'Local particle simulation updates while you edit. Show in Game uses LÖVE itself for the runtime-accurate result.'
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
          : 'h-7 gap-1.5 border-ok-border text-xs text-ok hover:bg-ok-surface hover:text-ok dark:hover:bg-ok-surface dark:hover:text-ok'
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
    const runtimeMessage = !allowGamePreview
      ? 'This creative workspace is local. Connect a LÖVE game session to preview particles in game.'
      : isGameComposite
      ? 'This composite is owned and drawn by the connected game.'
      : gamePreviewActive && runtimeSuspended
        ? 'Running from the last particle payload. Resume Feather to sync edits.'
        : gamePreviewActive
        ? previewOutOfDate
          ? 'Particle edits are waiting to sync to the game preview.'
          : 'The game is drawing the latest synced particle project.'
        : 'Tauri uses the connected LÖVE runtime for particle preview right now. Nothing is drawn in the game until you choose Show in Game.';
    const statusMessage = error ?? effectiveDisabledReason ?? runtimeMessage;

    return (
      <section className="surface grid min-w-0 gap-3 p-3" data-testid="particle-preview-monitor">
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
          <div className="flex flex-wrap justify-end gap-2">
            {previewOutOfDate && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={status === 'sending' || runtimeSuspended}
                onClick={() => void refreshGamePreview()}
              >
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </Button>
            )}
            {gamePreviewButton}
          </div>
        </div>
        <div className="surface-inset px-3 py-2 text-xs text-muted-foreground">{statusMessage}</div>
      </section>
    );
  }

  return (
    <LoveJsPreview
      title="Particle Preview"
      description={description}
      payload={payload}
      fill
      className="rounded-none border-0 bg-transparent"
      actions={<PreviewGroundControl value={previewGround} onChange={setPreviewGround} />}
      footer={footer}
    />
  );
}
