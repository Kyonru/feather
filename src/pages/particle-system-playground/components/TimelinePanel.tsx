import { ChevronDownIcon, ChevronRightIcon, PauseIcon, PlayIcon, PlusIcon, RotateCcwIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import {
  PARTICLE_TIMELINE_LANE_DEFAULTS,
  PARTICLE_TIMELINE_LANE_LABELS,
  evaluateParticleKeyframes,
  normalizeParticleTimeline,
  trackIsActive,
} from '../timeline';
import { ParticleNumberInput } from './ParticleNumberInput';
import {
  PARTICLE_TIMELINE_LANES,
  type ParticleSystemPlaygroundCompositeData,
  type ParticleSystemPlaygroundSystem,
  type ParticleTimeline,
  type ParticleTimelineClip,
  type ParticleTimelineKeyframe,
  type ParticleTimelineLane,
  type ParticleTimelineTrack,
} from '@/types/particle-system-playground';

type Props = {
  composite: ParticleSystemPlaygroundCompositeData;
  activeSystemIndex: number;
  isGameComposite: boolean;
  onSelectSystem: (index: number) => void;
  onTimelineChange: (timeline: ParticleTimeline) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number, immediate?: boolean) => void;
};

function formatTime(value: number): string {
  return `${value.toFixed(2)}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function timeToPercent(time: number, duration: number): number {
  if (duration <= 0) return 0;
  return clamp((time / duration) * 100, 0, 100);
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function particleTailDuration(system: ParticleSystemPlaygroundSystem): number {
  return Math.max(
    0,
    finiteNumber(
      system.properties.particleLifetimeMax,
      finiteNumber(system.properties.particleLifetimeMin, 0),
    ),
  );
}

function emitterLifetimeDuration(system: ParticleSystemPlaygroundSystem): number {
  return finiteNumber(system.properties.emitterLifetime, -1);
}

function emissionSegmentForClip(
  clip: ParticleTimelineClip,
  emitterLifetime: number,
): { start: number; end: number } | null {
  const clipDuration = Math.max(0, clip.end - clip.start);
  if (clipDuration <= 0 || emitterLifetime < 0 || emitterLifetime >= clipDuration) return null;
  return {
    start: clip.start,
    end: Math.min(clip.end, clip.start + Math.max(0.01, emitterLifetime)),
  };
}

function tailSegmentsForClip(
  clip: ParticleTimelineClip,
  tailDuration: number,
  timelineDuration: number,
  loop: boolean,
): Array<{ start: number; end: number }> {
  const tail = Math.min(Math.max(0, tailDuration), timelineDuration);
  if (tail <= 0 || timelineDuration <= 0) return [];

  if (!loop) {
    const start = clamp(clip.end, 0, timelineDuration);
    const end = clamp(clip.end + tail, 0, timelineDuration);
    return end > start ? [{ start, end }] : [];
  }

  const segments: Array<{ start: number; end: number }> = [];
  let remaining = tail;
  let cursor = clip.end >= timelineDuration ? 0 : clamp(clip.end, 0, timelineDuration);
  while (remaining > 0 && segments.length < 2) {
    const end = Math.min(timelineDuration, cursor + remaining);
    if (end > cursor) segments.push({ start: cursor, end });
    remaining -= end - cursor;
    cursor = 0;
  }
  return segments;
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function updateTrack(timeline: ParticleTimeline, systemIndex: number, updater: (track: ParticleTimelineTrack) => ParticleTimelineTrack) {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => (track.systemIndex === systemIndex ? updater(track) : track)),
  };
}

function sortedKeyframes(points: ParticleTimelineKeyframe[] = []): ParticleTimelineKeyframe[] {
  return [...points].sort((a, b) => a.time - b.time);
}

export function TimelinePanel({
  composite,
  activeSystemIndex,
  isGameComposite,
  onSelectSystem,
  onTimelineChange,
  onPlay,
  onPause,
  onStop,
  onSeek,
}: Props) {
  const timeline = useMemo(
    () => normalizeParticleTimeline(composite.timeline, composite.systems),
    [composite.systems, composite.timeline],
  );
  const [expandedTrack, setExpandedTrack] = useState<number>(activeSystemIndex);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const currentTime = clamp(composite.timelineState?.time ?? 0, 0, timeline.duration);
  const playing = composite.timelineState?.playing === true;
  const visibleTrack = timeline.tracks.find((track) => track.systemIndex === expandedTrack) ?? timeline.tracks[0];
  const timelineWidth = `${Math.round(Math.max(1, zoom) * 100)}%`;
  const playheadPercent = timeToPercent(currentTime, timeline.duration);

  const commitTimeline = (next: ParticleTimeline) => {
    onTimelineChange(normalizeParticleTimeline(next, composite.systems));
  };

  const snapTime = (time: number) => {
    const clamped = clamp(time, 0, timeline.duration);
    return snap ? Math.round(clamped * 10) / 10 : clamped;
  };

  const setDuration = (duration: number) => {
    commitTimeline({
      ...timeline,
      duration: clamp(duration, 0.25, 60),
    });
  };

  const setLoop = (loop: boolean) => {
    commitTimeline({ ...timeline, loop });
  };

  const setClipValue = (systemIndex: number, clipId: string, key: 'start' | 'end' | 'emit', value: number) => {
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId) return clip;
          if (key === 'start') {
            const start = snapTime(Math.min(value, clip.end - 0.01));
            return { ...clip, start };
          }
          if (key === 'end') {
            const end = snapTime(Math.max(value, clip.start + 0.01));
            return { ...clip, end };
          }
          return { ...clip, emit: Math.max(0, Math.floor(value)) };
        }),
      })),
    );
  };

  const addKeyframe = (systemIndex: number, lane: ParticleTimelineLane) => {
    const existing = visibleTrack?.lanes[lane] ?? [];
    const value = evaluateParticleKeyframes(existing, currentTime, PARTICLE_TIMELINE_LANE_DEFAULTS[lane]);
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        lanes: {
          ...track.lanes,
          [lane]: [
            ...(track.lanes[lane] ?? []),
            { id: uniqueId(lane), time: snapTime(currentTime), value },
          ].sort((a, b) => a.time - b.time),
        },
      })),
    );
  };

  const updateKeyframe = (
    systemIndex: number,
    lane: ParticleTimelineLane,
    id: string,
    key: 'time' | 'value',
    value: number,
  ) => {
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        lanes: {
          ...track.lanes,
          [lane]: sortedKeyframes(track.lanes[lane]).map((point) =>
            point.id === id
              ? {
                  ...point,
                  [key]: key === 'time' ? snapTime(value) : value,
                }
              : point,
          ),
        },
      })),
    );
  };

  const deleteKeyframe = (systemIndex: number, lane: ParticleTimelineLane, id: string) => {
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        lanes: {
          ...track.lanes,
          [lane]: sortedKeyframes(track.lanes[lane]).filter((point) => point.id !== id),
        },
      })),
    );
  };

  return (
    <section className="grid gap-3 rounded-md border bg-card p-3" data-testid="particle-timeline-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Author emitter entrances and common property changes over a finite effect pass.
          </p>
        </div>
        {isGameComposite && (
          <Badge variant="outline" className="h-6 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
            Game composite: draw-only lanes are best effort
          </Badge>
        )}
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/20 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" className="size-8" title={playing ? 'Pause timeline' : 'Play timeline'} onClick={playing ? onPause : onPlay}>
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </Button>
          <Button size="icon" variant="outline" className="size-8" title="Stop timeline" onClick={onStop}>
            <SquareIcon className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" title="Reset playhead" onClick={() => onSeek(0, true)}>
            <RotateCcwIcon className="size-4" />
          </Button>
          <div className="min-w-28 text-xs tabular-nums text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(timeline.duration)}
          </div>
          <input
            aria-label="Timeline playhead"
            data-testid="particle-timeline-playhead"
            className="h-2 min-w-48 flex-1 accent-primary"
            type="range"
            min={0}
            max={timeline.duration}
            step={snap ? 0.1 : 0.01}
            value={currentTime}
            onChange={(event) => onSeek(Number(event.target.value), false)}
            onMouseUp={(event) => onSeek(Number((event.target as HTMLInputElement).value), true)}
            onTouchEnd={(event) => onSeek(Number((event.target as HTMLInputElement).value), true)}
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-[9rem_9rem_minmax(18rem,1fr)]">
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            Duration
            <ParticleNumberInput
              className="h-8 rounded border bg-background px-2 text-xs text-foreground"
              min={0.25}
              max={60}
              value={timeline.duration}
              onValueChange={setDuration}
            />
          </label>
          <div className="flex items-end gap-2">
            <Checkbox id="particle-timeline-loop" checked={timeline.loop} onCheckedChange={(checked) => setLoop(checked === true)} />
            <Label htmlFor="particle-timeline-loop" className="pb-2 text-xs">
              Loop
            </Label>
          </div>
          <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setZoom((value) => clamp(value - 0.25, 1, 3))}>
              Zoom Out
            </Button>
            <Badge variant="secondary" className="h-8 px-2 text-[10px]">
              {Math.round(zoom * 100)}%
            </Badge>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setZoom((value) => clamp(value + 0.25, 1, 3))}>
              Zoom In
            </Button>
            <Button size="sm" variant={snap ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setSnap((value) => !value)}>
              Snap {snap ? 'On' : 'Off'}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border" data-testid="particle-timeline-scroll">
        <div className="min-w-full" data-testid="particle-timeline-canvas" style={{ minWidth: timelineWidth }}>
          <div className="grid grid-cols-[11rem_minmax(24rem,1fr)] border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="px-3 py-2">Emitter</div>
            <div className="px-3 py-2">
              <div className="relative h-4" data-testid="particle-timeline-ruler-strip">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span className="absolute left-0 top-0 -translate-y-0.5">0s</span>
                <span className="absolute right-0 top-0 -translate-y-0.5">{formatTime(timeline.duration)}</span>
                <div
                  className="absolute top-[-0.5rem] h-[calc(100%+1rem)] w-px bg-primary/60"
                  style={{ left: `${playheadPercent}%` }}
                />
              </div>
            </div>
          </div>

          {composite.systems.map((system) => {
            const track = timeline.tracks.find((item) => item.systemIndex === system.index);
            const active = track ? trackIsActive(track, currentTime) : false;
            const selected = system.index === activeSystemIndex;
            return (
              <button
                key={system.index}
                type="button"
                data-testid={`particle-timeline-track-${system.index}`}
                className={[
                  'grid w-full grid-cols-[11rem_minmax(24rem,1fr)] border-b text-left transition-colors last:border-b-0',
                  selected ? 'bg-primary/10' : 'hover:bg-muted/35',
                  system.enabled ? '' : 'opacity-55',
                ].join(' ')}
                onClick={() => {
                  onSelectSystem(system.index);
                  setExpandedTrack(system.index);
                }}
              >
                <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                  <span className="truncate text-xs font-medium">{system.title}</span>
                  {active && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      live
                    </Badge>
                  )}
                  {!system.enabled && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      muted
                    </Badge>
                  )}
                </div>
                <div className="min-h-10 px-3 py-2">
                  <div className="relative h-6" data-testid={`particle-timeline-track-strip-${system.index}`}>
                    <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                    <div
                      className="absolute top-[-0.5rem] h-[calc(100%+1rem)] w-px bg-primary/40"
                      style={{ left: `${playheadPercent}%` }}
                    />
                    {track?.clips.map((clip) =>
                      tailSegmentsForClip(clip, particleTailDuration(system), timeline.duration, timeline.loop).map(
                        (segment, index) => {
                          const startPercent = timeToPercent(segment.start, timeline.duration);
                          const endPercent = timeToPercent(segment.end, timeline.duration);
                          return (
                            <div
                              key={`${clip.id}-tail-${index}`}
                              data-testid={`particle-timeline-tail-${system.index}`}
                              className="pointer-events-none absolute inset-y-[3px] rounded-sm border border-dashed border-primary/25 bg-primary/10"
                              style={{
                                left: `${startPercent}%`,
                                right: `${100 - Math.max(startPercent, endPercent)}%`,
                                minWidth: '0.25rem',
                              }}
                              title={`${system.title} particle tail: up to ${formatTime(particleTailDuration(system))}`}
                            />
                          );
                        },
                      ),
                    )}
                    {track?.clips.map((clip) => {
                      const startPercent = timeToPercent(clip.start, timeline.duration);
                      const endPercent = timeToPercent(clip.end, timeline.duration);
                      const emissionSegment = emissionSegmentForClip(clip, emitterLifetimeDuration(system));
                      return (
                        <div
                          key={clip.id}
                          data-testid={`particle-timeline-clip-${system.index}`}
                          className="absolute inset-y-0 rounded-sm border border-primary/40 bg-primary/20"
                          style={{
                            left: `${startPercent}%`,
                            right: `${100 - Math.max(startPercent, endPercent)}%`,
                            minWidth: '0.35rem',
                          }}
                          title={`${system.title}: ${formatTime(clip.start)} to ${formatTime(clip.end)}`}
                        >
                          {emissionSegment && (
                            <div
                              data-testid={`particle-timeline-emission-window-${system.index}`}
                              className="pointer-events-none absolute inset-y-[5px] rounded-sm bg-primary/55"
                              style={{
                                left: `${timeToPercent(emissionSegment.start - clip.start, Math.max(0.01, clip.end - clip.start))}%`,
                                right: `${
                                  100 -
                                  timeToPercent(emissionSegment.end - clip.start, Math.max(0.01, clip.end - clip.start))
                                }%`,
                                minWidth: '0.2rem',
                              }}
                              title={`${system.title} emits for ${formatTime(emitterLifetimeDuration(system))} inside this clip`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {visibleTrack && (
        <div className="grid gap-3 rounded-md border bg-muted/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold">
              {composite.systems.find((system) => system.index === visibleTrack.systemIndex)?.title ?? 'Emitter'} timing
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectSystem(visibleTrack.systemIndex)}>
              Select Emitter
            </Button>
          </div>

          <div className="grid gap-2">
            {visibleTrack.clips.map((clip) => (
              <div key={clip.id} className="grid gap-2 rounded border bg-background p-2 md:grid-cols-3">
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Emit At
                  <ParticleNumberInput
                    aria-label="Emit at"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    max={timeline.duration}
                    value={clip.start}
                    onValueChange={(value) => setClipValue(visibleTrack.systemIndex, clip.id, 'start', value)}
                  />
                </label>
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Stop At
                  <ParticleNumberInput
                    aria-label="Stop at"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    max={timeline.duration}
                    value={clip.end}
                    onValueChange={(value) => setClipValue(visibleTrack.systemIndex, clip.id, 'end', value)}
                  />
                </label>
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Burst Particles
                  <ParticleNumberInput
                    aria-label="Burst particles"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    value={clip.emit ?? 0}
                    onValueChange={(value) => setClipValue(visibleTrack.systemIndex, clip.id, 'emit', value)}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            {PARTICLE_TIMELINE_LANES.map((lane) => {
              const points = sortedKeyframes(visibleTrack.lanes[lane]);
              return (
                <Collapsible key={lane} data-testid={`particle-timeline-lane-${lane}-${visibleTrack.systemIndex}`}>
                  <div className="rounded border bg-background">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="group flex w-full items-center justify-between gap-2 px-2 py-2 text-left">
                        <span className="flex items-center gap-2 text-xs font-medium">
                          <ChevronRightIcon className="size-3.5 shrink-0 group-data-[state=open]:hidden" />
                          <ChevronDownIcon className="hidden size-3.5 shrink-0 group-data-[state=open]:block" />
                          {PARTICLE_TIMELINE_LANE_LABELS[lane]}
                        </span>
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          {points.length} keys
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid gap-2 border-t p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-fit gap-1 text-xs"
                          onClick={() => addKeyframe(visibleTrack.systemIndex, lane)}
                        >
                          <PlusIcon className="size-3.5" />
                          Add key at playhead
                        </Button>
                        {points.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No keyframes on this lane yet.</div>
                        ) : (
                          <div className="grid gap-2">
                            <div
                              className="relative h-7 rounded border bg-muted/30"
                              data-testid={`particle-timeline-key-strip-${lane}-${visibleTrack.systemIndex}`}
                            >
                              <div className="absolute inset-x-2 inset-y-0">
                                <div className="relative h-full">
                                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                                  <div
                                    className="absolute top-1 h-5 w-px bg-primary/50"
                                    style={{ left: `${playheadPercent}%` }}
                                  />
                                  {points.map((point) => (
                                    <div
                                      key={point.id}
                                      className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-primary bg-background"
                                      style={{ left: `${timeToPercent(point.time, timeline.duration)}%` }}
                                      title={`${PARTICLE_TIMELINE_LANE_LABELS[lane]} ${formatTime(point.time)} = ${point.value}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            {points.map((point) => (
                              <div key={point.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                <label className="grid gap-1 text-[10px] text-muted-foreground">
                                  Time
                                  <ParticleNumberInput
                                    aria-label={`${PARTICLE_TIMELINE_LANE_LABELS[lane]} key time`}
                                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                                    min={0}
                                    max={timeline.duration}
                                    value={point.time}
                                    onValueChange={(value) => updateKeyframe(visibleTrack.systemIndex, lane, point.id, 'time', value)}
                                  />
                                </label>
                                <label className="grid gap-1 text-[10px] text-muted-foreground">
                                  Value
                                  <ParticleNumberInput
                                    aria-label={`${PARTICLE_TIMELINE_LANE_LABELS[lane]} key value`}
                                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                                    value={point.value}
                                    onValueChange={(value) => updateKeyframe(visibleTrack.systemIndex, lane, point.id, 'value', value)}
                                  />
                                </label>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="mt-4 size-8"
                                  title="Delete keyframe"
                                  onClick={() => deleteKeyframe(visibleTrack.systemIndex, lane, point.id)}
                                >
                                  <Trash2Icon className="size-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
