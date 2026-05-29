import {
  CopyIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/store/settings';
import {
  PARTICLE_TIMELINE_EASING_LABELS,
  easeParticleTimelineValue,
  normalizeParticleTimelineEasing,
} from '../easing';
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
  PARTICLE_TIMELINE_EASINGS,
  type ParticleSystemPlaygroundCompositeData,
  type ParticleSystemPlaygroundSystem,
  type ParticleTimeline,
  type ParticleTimelineEasing,
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
  onPause: (time?: number) => void;
  onStop: () => void;
  onSeek: (time: number, immediate?: boolean) => void;
};

type SelectedTimelineItem =
  | { type: 'emitter'; systemIndex: number }
  | { type: 'clip'; systemIndex: number; clipId: string }
  | { type: 'lane'; systemIndex: number; lane: ParticleTimelineLane }
  | { type: 'keyframe'; systemIndex: number; lane: ParticleTimelineLane; keyframeId: string };

type DragState =
  | {
      type: 'clip';
      mode: 'move' | 'start' | 'end';
      systemIndex: number;
      clipId: string;
      pointerStartX: number;
      hasMoved: boolean;
      stripLeft: number;
      stripWidth: number;
      initialStart: number;
      initialEnd: number;
    }
  | {
      type: 'keyframe';
      systemIndex: number;
      lane: ParticleTimelineLane;
      keyframeId: string;
      pointerStartX: number;
      hasMoved: boolean;
      stripLeft: number;
      stripWidth: number;
    };

const MIN_CLIP_DURATION = 0.01;
const DRAG_START_THRESHOLD_PX = 2;

function formatTime(value: number): string {
  return `${value.toFixed(2)}s`;
}

function formatTick(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTimelineTime(value: number): number {
  return Math.round(value * 1000) / 1000;
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
    end: Math.min(clip.end, clip.start + Math.max(MIN_CLIP_DURATION, emitterLifetime)),
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

function updateTrack(
  timeline: ParticleTimeline,
  systemIndex: number,
  updater: (track: ParticleTimelineTrack) => ParticleTimelineTrack,
) {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => (track.systemIndex === systemIndex ? updater(track) : track)),
  };
}

function sortedKeyframes(points: ParticleTimelineKeyframe[] = []): ParticleTimelineKeyframe[] {
  return [...points].sort((a, b) => a.time - b.time);
}

function laneValueRange(points: ParticleTimelineKeyframe[], lane: ParticleTimelineLane): { min: number; max: number } {
  const values = points.length > 0 ? points.map((point) => point.value) : [PARTICLE_TIMELINE_LANE_DEFAULTS[lane]];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = PARTICLE_TIMELINE_LANE_DEFAULTS[lane];
    max = min;
  }
  if (Math.abs(max - min) < 0.0001) {
    const padding = Math.max(1, Math.abs(max) * 0.25);
    min -= padding;
    max += padding;
  }
  return { min, max };
}

function laneValueToSvgY(value: number, range: { min: number; max: number }): number {
  return 88 - ((value - range.min) / (range.max - range.min)) * 76;
}

function laneCurvePath(points: ParticleTimelineKeyframe[], lane: ParticleTimelineLane, duration: number): string {
  if (points.length === 0 || duration <= 0) return '';
  const range = laneValueRange(points, lane);
  const commands: string[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const x = timeToPercent(point.time, duration);
    const y = laneValueToSvgY(point.value, range);
    commands.push(`${commands.length === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`);

    const next = points[index + 1];
    if (!next) continue;
    const span = Math.max(0.0001, next.time - point.time);
    const samples = normalizeParticleTimelineEasing(point.easing) === 'hold' ? 1 : 10;
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples;
      const eased = easeParticleTimelineValue(point.easing, t);
      const sampleTime = point.time + span * t;
      const sampleValue = point.value + (next.value - point.value) * eased;
      commands.push(
        `L ${timeToPercent(sampleTime, duration).toFixed(3)} ${laneValueToSvgY(sampleValue, range).toFixed(3)}`,
      );
    }
  }

  return commands.join(' ');
}

function timelineTicks(duration: number, zoom: number): Array<{ time: number; label: string }> {
  if (duration <= 0) return [{ time: 0, label: '0s' }];
  const step = duration <= 4 ? (zoom >= 2 ? 0.25 : 0.5) : duration <= 12 ? (zoom >= 2 ? 0.5 : 1) : zoom >= 2 ? 1 : 2;
  const ticks: Array<{ time: number; label: string }> = [];
  for (let time = 0; time < duration; time += step) {
    ticks.push({ time: Number(time.toFixed(3)), label: formatTick(time) });
  }
  if (ticks.length === 0 || ticks[ticks.length - 1].time !== duration) {
    ticks.push({ time: duration, label: formatTime(duration) });
  }
  return ticks;
}

function timeFromClientX(clientX: number, stripLeft: number, stripWidth: number, duration: number): number {
  if (stripWidth <= 0) return 0;
  return clamp(((clientX - stripLeft) / stripWidth) * duration, 0, duration);
}

function targetIsTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
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
  const sourceTimeline = useMemo(
    () => normalizeParticleTimeline(composite.timeline, composite.systems),
    [composite.systems, composite.timeline],
  );
  const zoom = useSettingsStore((state) => state.particleTimelineZoom);
  const snap = useSettingsStore((state) => state.particleTimelineSnap);
  const setZoom = useSettingsStore((state) => state.setParticleTimelineZoom);
  const setSnap = useSettingsStore((state) => state.setParticleTimelineSnap);
  const [expandedTrack, setExpandedTrack] = useState<number>(activeSystemIndex);
  const [selectedItem, setSelectedItem] = useState<SelectedTimelineItem | null>(null);
  const [localPlayheadTime, setLocalPlayheadTime] = useState<number | null>(null);
  const [draftTimeline, setDraftTimeline] = useState<ParticleTimeline | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragDraftRef = useRef<ParticleTimeline | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const displayTimeRef = useRef(0);
  const timeline = draftTimeline ?? sourceTimeline;
  const currentTime = clamp(composite.timelineState?.time ?? 0, 0, timeline.duration);
  const displayTime = localPlayheadTime ?? currentTime;
  const playing = composite.timelineState?.playing === true;
  const timelineWidth = `${Math.round(Math.max(1, zoom) * 100)}%`;
  const playheadPercent = timeToPercent(displayTime, timeline.duration);
  const ticks = useMemo(() => timelineTicks(timeline.duration, zoom), [timeline.duration, zoom]);
  const selectedSystemIndex = selectedItem?.systemIndex ?? expandedTrack;
  const selectedTrack =
    timeline.tracks.find((track) => track.systemIndex === selectedSystemIndex) ??
    timeline.tracks.find((track) => track.systemIndex === expandedTrack) ??
    timeline.tracks[0];
  const selectedSystem = composite.systems.find((system) => system.index === selectedTrack?.systemIndex);
  const selectedClip =
    selectedItem?.type === 'clip'
      ? selectedTrack?.clips.find((clip) => clip.id === selectedItem.clipId) ?? null
      : null;
  const selectedLane =
    selectedItem?.type === 'lane' || selectedItem?.type === 'keyframe' ? selectedItem.lane : null;
  const selectedKeyframe =
    selectedItem?.type === 'keyframe' && selectedTrack
      ? sortedKeyframes(selectedTrack.lanes[selectedItem.lane]).find((point) => point.id === selectedItem.keyframeId) ?? null
      : null;
  const selectedKeyframes =
    selectedItem?.type === 'keyframe' && selectedTrack ? sortedKeyframes(selectedTrack.lanes[selectedItem.lane]) : [];
  const selectedKeyframeIndex = selectedKeyframe
    ? selectedKeyframes.findIndex((point) => point.id === selectedKeyframe.id)
    : -1;
  const selectedKeyframeHasOutgoingSegment =
    selectedKeyframeIndex >= 0 && selectedKeyframeIndex < selectedKeyframes.length - 1;

  useEffect(() => {
    displayTimeRef.current = displayTime;
  }, [displayTime]);

  useEffect(() => {
    if (dragRef.current) return;
    dragDraftRef.current = null;
    setDraftTimeline(null);
  }, [sourceTimeline]);

  useEffect(() => {
    if (!playing) return;

    const duration = Math.max(0.01, timeline.duration);
    const startedAt = performance.now();
    const startTime = clamp(displayTimeRef.current, 0, duration);

    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const nextTime = startTime + elapsed;
      const displayed = timeline.loop ? nextTime % duration : Math.min(nextTime, duration);
      setLocalPlayheadTime(displayed);

      if (!timeline.loop && nextTime >= duration) {
        playbackFrameRef.current = null;
        return;
      }
      playbackFrameRef.current = requestAnimationFrame(tick);
    };

    setLocalPlayheadTime(startTime);
    playbackFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [playing, timeline.duration, timeline.loop]);

  useEffect(() => {
    setLocalPlayheadTime((time) => (time === null ? null : clamp(time, 0, timeline.duration)));
  }, [timeline.duration]);

  useEffect(() => {
    if (playing) return;
    setLocalPlayheadTime((time) => {
      if (time === null) return null;
      return Math.abs(time - currentTime) < 0.05 ? null : time;
    });
  }, [currentTime, playing]);

  useEffect(() => {
    if (!timeline.tracks.some((track) => track.systemIndex === activeSystemIndex)) return;
    setExpandedTrack(activeSystemIndex);
    setSelectedItem((current) => {
      if (current?.systemIndex === activeSystemIndex) return current;
      const track = timeline.tracks.find((item) => item.systemIndex === activeSystemIndex);
      return track?.clips[0]
        ? { type: 'clip', systemIndex: activeSystemIndex, clipId: track.clips[0].id }
        : { type: 'emitter', systemIndex: activeSystemIndex };
    });
  }, [activeSystemIndex, timeline.tracks]);

  const commitTimeline = (next: ParticleTimeline) => {
    onTimelineChange(normalizeParticleTimeline(next, composite.systems));
  };

  const stageDragTimeline = (next: ParticleTimeline) => {
    const normalized = normalizeParticleTimeline(next, composite.systems);
    dragDraftRef.current = normalized;
    setDraftTimeline(normalized);
    return normalized;
  };

  const snapTime = (time: number) => {
    const clamped = clamp(time, 0, timeline.duration);
    return roundTimelineTime(snap ? Math.round(clamped * 10) / 10 : clamped);
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

  const selectTrack = (systemIndex: number) => {
    const track = timeline.tracks.find((item) => item.systemIndex === systemIndex);
    onSelectSystem(systemIndex);
    setExpandedTrack(systemIndex);
    setSelectedItem(
      track?.clips[0]
        ? { type: 'clip', systemIndex, clipId: track.clips[0].id }
        : { type: 'emitter', systemIndex },
    );
  };

  const setClipValue = (systemIndex: number, clipId: string, key: 'start' | 'end' | 'emit', value: number) => {
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId) return clip;
          if (key === 'start') {
            const start = snapTime(Math.min(value, clip.end - MIN_CLIP_DURATION));
            return { ...clip, start };
          }
          if (key === 'end') {
            const end = snapTime(Math.max(value, clip.start + MIN_CLIP_DURATION));
            return { ...clip, end };
          }
          return { ...clip, emit: Math.max(0, Math.floor(value)) };
        }),
      })),
    );
  };

  const addClipAt = (systemIndex: number, time = displayTime) => {
    const id = uniqueId('clip');
    const defaultLength = Math.min(0.75, timeline.duration);
    const start = clamp(snapTime(time), 0, Math.max(0, timeline.duration - MIN_CLIP_DURATION));
    const end = roundTimelineTime(
      clamp(snapTime(Math.max(start + MIN_CLIP_DURATION, start + defaultLength)), start + MIN_CLIP_DURATION, timeline.duration),
    );
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        clips: [...track.clips, { id, start, end, emit: 0 }].sort((a, b) => a.start - b.start),
      })),
    );
    setExpandedTrack(systemIndex);
    setSelectedItem({ type: 'clip', systemIndex, clipId: id });
  };

  const duplicateClip = (systemIndex: number, clip: ParticleTimelineClip) => {
    const id = uniqueId('clip');
    const clipDuration = Math.max(MIN_CLIP_DURATION, clip.end - clip.start);
    const start = clamp(snapTime(clip.start + 0.1), 0, Math.max(0, timeline.duration - clipDuration));
    const end = roundTimelineTime(clamp(start + clipDuration, start + MIN_CLIP_DURATION, timeline.duration));
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        clips: [...track.clips, { ...clip, id, start, end }].sort((a, b) => a.start - b.start),
      })),
    );
    setSelectedItem({ type: 'clip', systemIndex, clipId: id });
  };

  const deleteClip = (systemIndex: number, clipId: string) => {
    commitTimeline(
      updateTrack(timeline, systemIndex, (track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== clipId),
      })),
    );
    setSelectedItem({ type: 'emitter', systemIndex });
  };

  const addKeyframeAt = (systemIndex: number, lane: ParticleTimelineLane, time = displayTime) => {
    const id = uniqueId(lane);
    const track = timeline.tracks.find((item) => item.systemIndex === systemIndex);
    const keyTime = snapTime(time);
    const existing = track?.lanes[lane] ?? [];
    const value = evaluateParticleKeyframes(existing, keyTime, PARTICLE_TIMELINE_LANE_DEFAULTS[lane]);
    commitTimeline(
      updateTrack(timeline, systemIndex, (item) => ({
        ...item,
        lanes: {
          ...item.lanes,
          [lane]: [
            ...(item.lanes[lane] ?? []),
            { id, time: keyTime, value },
          ].sort((a, b) => a.time - b.time),
        },
      })),
    );
    setExpandedTrack(systemIndex);
    setSelectedItem({ type: 'keyframe', systemIndex, lane, keyframeId: id });
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

  const updateKeyframeEasing = (
    systemIndex: number,
    lane: ParticleTimelineLane,
    id: string,
    easing: ParticleTimelineEasing,
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
                  easing: normalizeParticleTimelineEasing(easing),
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
    setSelectedItem({ type: 'lane', systemIndex, lane });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (targetIsTextInput(event.target)) return;
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      if (selectedItem?.type !== 'keyframe') return;
      event.preventDefault();
      deleteKeyframe(selectedItem.systemIndex, selectedItem.lane, selectedItem.keyframeId);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const applyDragClientX = (clientX: number): ParticleTimeline | null => {
    const drag = dragRef.current;
    if (!drag) return null;
    if (!drag.hasMoved) {
      if (Math.abs(clientX - drag.pointerStartX) < DRAG_START_THRESHOLD_PX) return null;
      drag.hasMoved = true;
    }

    if (drag.type === 'keyframe') {
      return stageDragTimeline(
        updateTrack(timeline, drag.systemIndex, (track) => ({
          ...track,
          lanes: {
            ...track.lanes,
            [drag.lane]: sortedKeyframes(track.lanes[drag.lane]).map((point) =>
              point.id === drag.keyframeId
                ? {
                    ...point,
                    time: snapTime(timeFromClientX(clientX, drag.stripLeft, drag.stripWidth, timeline.duration)),
                  }
                : point,
            ),
          },
        })),
      );
    }

    if (drag.mode === 'move') {
      const clipDuration = Math.max(MIN_CLIP_DURATION, drag.initialEnd - drag.initialStart);
      const delta = ((clientX - drag.pointerStartX) / drag.stripWidth) * timeline.duration;
      const start = clamp(snapTime(drag.initialStart + delta), 0, Math.max(0, timeline.duration - clipDuration));
      const end = roundTimelineTime(clamp(start + clipDuration, start + MIN_CLIP_DURATION, timeline.duration));
      return stageDragTimeline(
        updateTrack(timeline, drag.systemIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => (clip.id === drag.clipId ? { ...clip, start, end } : clip)),
        })),
      );
    }

    const pointerTime = timeFromClientX(clientX, drag.stripLeft, drag.stripWidth, timeline.duration);
    return stageDragTimeline(
      updateTrack(timeline, drag.systemIndex, (track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== drag.clipId) return clip;
          if (drag.mode === 'start') {
            return { ...clip, start: snapTime(Math.min(pointerTime, drag.initialEnd - MIN_CLIP_DURATION)) };
          }
          return { ...clip, end: snapTime(Math.max(pointerTime, drag.initialStart + MIN_CLIP_DURATION)) };
        }),
      })),
    );
  };

  const commitDragTimeline = (next: ParticleTimeline | null) => {
    const drag = dragRef.current;
    const finalTimeline = next ?? dragDraftRef.current;
    const shouldCommit = drag?.hasMoved === true && finalTimeline !== null;
    cleanupDocumentDrag();
    dragRef.current = null;
    dragDraftRef.current = null;
    setDraftTimeline(null);
    if (shouldCommit && finalTimeline) commitTimeline(finalTimeline);
  };

  const cleanupDocumentDrag = () => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  };

  const endPointerDrag = (event?: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    event?.stopPropagation();
    const next = event ? applyDragClientX(event.clientX) : dragDraftRef.current;
    if (event) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
    commitDragTimeline(next);
  };

  const beginDocumentDrag = () => {
    cleanupDocumentDrag();
    const handleDocumentMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      event.preventDefault();
      applyDragClientX(event.clientX);
    };
    const handleDocumentEnd = (event: PointerEvent) => {
      if (!dragRef.current) return;
      commitDragTimeline(applyDragClientX(event.clientX));
    };
    window.addEventListener('pointermove', handleDocumentMove, { passive: false });
    window.addEventListener('pointerup', handleDocumentEnd);
    window.addEventListener('pointercancel', handleDocumentEnd);
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleDocumentMove);
      window.removeEventListener('pointerup', handleDocumentEnd);
      window.removeEventListener('pointercancel', handleDocumentEnd);
    };
  };

  const beginClipDrag = (
    event: React.PointerEvent<HTMLElement>,
    mode: 'move' | 'start' | 'end',
    systemIndex: number,
    clip: ParticleTimelineClip,
  ) => {
    const strip = event.currentTarget.closest('[data-timeline-strip="true"]') as HTMLElement | null;
    const rect = strip?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: 'clip',
      mode,
      systemIndex,
      clipId: clip.id,
      pointerStartX: event.clientX,
      hasMoved: false,
      stripLeft: rect.left,
      stripWidth: rect.width,
      initialStart: clip.start,
      initialEnd: clip.end,
    };
    beginDocumentDrag();
    setExpandedTrack(systemIndex);
    setSelectedItem({ type: 'clip', systemIndex, clipId: clip.id });
  };

  const beginKeyframeDrag = (
    event: React.PointerEvent<HTMLElement>,
    systemIndex: number,
    lane: ParticleTimelineLane,
    point: ParticleTimelineKeyframe,
  ) => {
    const strip = event.currentTarget.closest('[data-timeline-strip="true"]') as HTMLElement | null;
    const rect = strip?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: 'keyframe',
      systemIndex,
      lane,
      keyframeId: point.id,
      pointerStartX: event.clientX,
      hasMoved: false,
      stripLeft: rect.left,
      stripWidth: rect.width,
    };
    beginDocumentDrag();
    setExpandedTrack(systemIndex);
    setSelectedItem({ type: 'keyframe', systemIndex, lane, keyframeId: point.id });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    applyDragClientX(event.clientX);
  };

  useEffect(() => () => cleanupDocumentDrag(), []);

  const renderPlayhead = (opacity = 'bg-primary/40') => (
    <div
      className={`pointer-events-none absolute top-[-0.5rem] z-20 h-[calc(100%+1rem)] w-px ${opacity}`}
      style={{ left: `${playheadPercent}%` }}
    />
  );

  return (
    <section className="grid min-w-0 gap-3 rounded-md border bg-card p-3" data-testid="particle-timeline-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Arrange emitter clips and keyframe common properties on one shared time scale.
          </p>
        </div>
        {isGameComposite && (
          <Badge variant="outline" className="h-6 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
            Game composite: draw-only lanes are best effort
          </Badge>
        )}
      </div>

      <div className="sticky top-0 z-40 grid gap-3 rounded-md border bg-card/95 p-2 shadow-xs backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            title={playing ? 'Pause timeline' : 'Play timeline'}
            onClick={() => {
              if (playing) {
                setLocalPlayheadTime(displayTimeRef.current);
                onPause(displayTimeRef.current);
              } else {
                onPlay();
              }
            }}
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            title="Stop timeline"
            onClick={() => {
              setLocalPlayheadTime(null);
              onStop();
            }}
          >
            <SquareIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            title="Reset playhead"
            onClick={() => {
              setLocalPlayheadTime(null);
              onSeek(0, true);
            }}
          >
            <RotateCcwIcon className="size-4" />
          </Button>
          <div className="min-w-28 text-xs tabular-nums text-muted-foreground">
            {formatTime(displayTime)} / {formatTime(timeline.duration)}
          </div>
          <input
            aria-label="Timeline playhead"
            data-testid="particle-timeline-playhead"
            className="h-2 min-w-48 flex-1 accent-primary"
            type="range"
            min={0}
            max={timeline.duration}
            step={snap ? 0.1 : 0.01}
            value={displayTime}
            onChange={(event) => {
              setLocalPlayheadTime(null);
              onSeek(Number(event.target.value), false);
            }}
            onMouseUp={(event) => {
              setLocalPlayheadTime(null);
              onSeek(Number((event.target as HTMLInputElement).value), true);
            }}
            onTouchEnd={(event) => {
              setLocalPlayheadTime(null);
              onSeek(Number((event.target as HTMLInputElement).value), true);
            }}
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
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              variant={timeline.loop ? 'default' : 'outline'}
              className="h-8 w-full justify-start gap-2 text-xs"
              aria-pressed={timeline.loop}
              onClick={() => setLoop(!timeline.loop)}
            >
              <RepeatIcon className="size-3.5" />
              Loop {timeline.loop ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setZoom(zoom - 0.25)}>
              Zoom Out
            </Button>
            <Badge variant="secondary" className="h-8 px-2 text-[10px]">
              {Math.round(zoom * 100)}%
            </Badge>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setZoom(zoom + 0.25)}>
              Zoom In
            </Button>
            <Button size="sm" variant={snap ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setSnap(!snap)}>
              Snap {snap ? 'On' : 'Off'}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border" data-testid="particle-timeline-scroll">
        <div
          className="min-w-full overflow-hidden"
          data-testid="particle-timeline-canvas"
          style={{ width: timelineWidth, minWidth: '100%' }}
        >
          <div className="grid grid-cols-[12rem_minmax(0,1fr)] border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="sticky left-0 z-30 border-r bg-muted/95 px-3 py-2">Emitter</div>
            <div className="min-w-0 px-3 py-2">
              <div className="relative h-5" data-testid="particle-timeline-ruler-strip">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                {ticks.map((tick) => {
                  const lastTick = tick.time >= timeline.duration;
                  return (
                    <div
                      key={`${tick.time}-${tick.label}`}
                      className="absolute top-0 h-full border-l border-border/70 pl-1"
                      style={{ left: lastTick ? 'calc(100% - 1px)' : `${timeToPercent(tick.time, timeline.duration)}%` }}
                    >
                      <span
                        className={[
                          'block -translate-y-0.5 whitespace-nowrap',
                          lastTick ? '-translate-x-full pr-1' : '',
                        ].join(' ')}
                      >
                        {tick.label}
                      </span>
                    </div>
                  );
                })}
                {renderPlayhead('bg-primary/60')}
              </div>
            </div>
          </div>

          {composite.systems.map((system) => {
            const track = timeline.tracks.find((item) => item.systemIndex === system.index);
            const active = track ? trackIsActive(track, displayTime) : false;
            const selected = system.index === activeSystemIndex;
            const expanded = system.index === expandedTrack;
            const trackKeyCount = PARTICLE_TIMELINE_LANES.reduce(
              (total, lane) => total + sortedKeyframes(track?.lanes[lane]).length,
              0,
            );

            return (
              <div key={system.index}>
                <div
                  role="button"
                  tabIndex={0}
                  data-testid={`particle-timeline-track-${system.index}`}
                  className={[
                    'grid w-full grid-cols-[12rem_minmax(0,1fr)] border-b text-left transition-colors',
                    selected ? 'bg-primary/10' : 'hover:bg-muted/35',
                    system.enabled ? '' : 'opacity-55',
                  ].join(' ')}
                  onClick={() => selectTrack(system.index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectTrack(system.index);
                    }
                  }}
                >
                  <div className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r bg-card/95 px-3 py-2">
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
                    {expanded && trackKeyCount > 0 && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        {trackKeyCount} keys
                      </Badge>
                    )}
                  </div>
                  <div className="min-h-11 min-w-0 px-3 py-2">
                    <div
                      className="relative h-7"
                      data-testid={`particle-timeline-track-strip-${system.index}`}
                      data-timeline-strip="true"
                      onPointerMove={handlePointerMove}
                      onPointerUp={endPointerDrag}
                      onPointerCancel={endPointerDrag}
                      onDoubleClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        addClipAt(system.index, timeFromClientX(event.clientX, rect.left, rect.width, timeline.duration));
                      }}
                    >
                      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                      {renderPlayhead()}
                      {track?.clips.map((clip) =>
                        tailSegmentsForClip(clip, particleTailDuration(system), timeline.duration, timeline.loop).map(
                          (segment, index) => {
                            const startPercent = timeToPercent(segment.start, timeline.duration);
                            const endPercent = timeToPercent(segment.end, timeline.duration);
                            return (
                              <div
                                key={`${clip.id}-tail-${index}`}
                                data-testid={`particle-timeline-tail-${system.index}`}
                                className="pointer-events-none absolute inset-y-[4px] rounded-sm border border-dashed border-primary/25 bg-primary/10"
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
                        const selectedClipMatch = selectedItem?.type === 'clip' && selectedItem.clipId === clip.id;
                        return (
                          <div
                            key={clip.id}
                            role="button"
                            tabIndex={0}
                            data-testid={`particle-timeline-clip-${system.index}`}
                            className={[
                              'absolute inset-y-0 cursor-grab rounded-sm border border-primary/45 bg-primary/25 shadow-xs outline-none',
                              'focus-visible:ring-ring/50 focus-visible:ring-2 active:cursor-grabbing',
                              selectedClipMatch ? 'ring-2 ring-primary/70' : '',
                            ].join(' ')}
                            style={{
                              left: `${startPercent}%`,
                              right: `${100 - Math.max(startPercent, endPercent)}%`,
                              minWidth: '0.45rem',
                            }}
                            title={`${system.title}: ${formatTime(clip.start)} to ${formatTime(clip.end)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedTrack(system.index);
                              setSelectedItem({ type: 'clip', systemIndex: system.index, clipId: clip.id });
                            }}
                            onPointerDown={(event) => beginClipDrag(event, 'move', system.index, clip)}
                          >
                            <div
                              data-testid={`particle-timeline-clip-start-handle-${system.index}`}
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-primary/70"
                              title="Drag clip start"
                              onPointerDown={(event) => beginClipDrag(event, 'start', system.index, clip)}
                            />
                            <div
                              data-testid={`particle-timeline-clip-end-handle-${system.index}`}
                              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-primary/70"
                              title="Drag clip end"
                              onPointerDown={(event) => beginClipDrag(event, 'end', system.index, clip)}
                            />
                            {emissionSegment && (
                              <div
                                data-testid={`particle-timeline-emission-window-${system.index}`}
                                className="pointer-events-none absolute inset-y-[6px] rounded-sm bg-primary/60"
                                style={{
                                  left: `${timeToPercent(emissionSegment.start - clip.start, Math.max(MIN_CLIP_DURATION, clip.end - clip.start))}%`,
                                  right: `${
                                    100 -
                                    timeToPercent(emissionSegment.end - clip.start, Math.max(MIN_CLIP_DURATION, clip.end - clip.start))
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
                </div>

                {expanded && track && (
                  <div className="border-b bg-muted/10" data-testid={`particle-timeline-lanes-${system.index}`}>
                    {PARTICLE_TIMELINE_LANES.map((lane) => {
                      const points = sortedKeyframes(track.lanes[lane]);
                      const curvePath = laneCurvePath(points, lane, timeline.duration);
                      const laneSelected =
                        (selectedItem?.type === 'lane' || selectedItem?.type === 'keyframe') &&
                        selectedItem.systemIndex === system.index &&
                        selectedItem.lane === lane;
                      return (
                        <div
                          key={lane}
                          data-testid={`particle-timeline-lane-${lane}-${system.index}`}
                          className={[
                            'grid grid-cols-[12rem_minmax(0,1fr)] text-left transition-colors',
                            laneSelected ? 'bg-primary/10' : '',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            className="sticky left-0 z-20 flex min-w-0 items-center justify-between gap-2 border-r bg-muted/95 px-3 py-1.5 text-left"
                            onClick={() => setSelectedItem({ type: 'lane', systemIndex: system.index, lane })}
                          >
                            <span className="truncate text-[11px] font-medium">{PARTICLE_TIMELINE_LANE_LABELS[lane]}</span>
                            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                              {points.length} keys
                            </Badge>
                          </button>
                          <div className="min-w-0 px-3 py-1.5">
                            <div
                              className="relative h-6 rounded border bg-background/70"
                              data-testid={`particle-timeline-key-strip-${lane}-${system.index}`}
                              data-timeline-strip="true"
                              onPointerMove={handlePointerMove}
                              onPointerUp={endPointerDrag}
                              onPointerCancel={endPointerDrag}
                              onClick={() => setSelectedItem({ type: 'lane', systemIndex: system.index, lane })}
                              onDoubleClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                addKeyframeAt(system.index, lane, timeFromClientX(event.clientX, rect.left, rect.width, timeline.duration));
                              }}
                            >
                              <div className="absolute inset-x-2 inset-y-0">
                                <div className="relative h-full">
                                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                                  {curvePath && (
                                    <svg
                                      aria-hidden="true"
                                      className="pointer-events-none absolute inset-0 size-full overflow-visible"
                                      data-testid={`particle-timeline-curve-${lane}-${system.index}`}
                                      preserveAspectRatio="none"
                                      viewBox="0 0 100 100"
                                    >
                                      <path
                                        d={curvePath}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        vectorEffect="non-scaling-stroke"
                                        className="text-primary/55"
                                      />
                                    </svg>
                                  )}
                                  {renderPlayhead('bg-primary/50')}
                                  {points.map((point) => {
                                    const selectedKey =
                                      selectedItem?.type === 'keyframe' &&
                                      selectedItem.systemIndex === system.index &&
                                      selectedItem.lane === lane &&
                                      selectedItem.keyframeId === point.id;
                                    return (
                                      <button
                                        key={point.id}
                                        type="button"
                                        data-testid={`particle-timeline-keyframe-${lane}-${system.index}`}
                                        className={[
                                          'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-primary bg-background outline-none',
                                          'focus-visible:ring-ring/50 focus-visible:ring-2',
                                          selectedKey ? 'bg-primary ring-2 ring-primary/40' : '',
                                        ].join(' ')}
                                        style={{
                                          left:
                                            point.time >= timeline.duration
                                              ? 'calc(100% - 0.25rem)'
                                              : `${timeToPercent(point.time, timeline.duration)}%`,
                                        }}
                                        title={`${PARTICLE_TIMELINE_LANE_LABELS[lane]} ${formatTime(point.time)} = ${point.value}`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelectedItem({ type: 'keyframe', systemIndex: system.index, lane, keyframeId: point.id });
                                        }}
                                        onPointerDown={(event) => beginKeyframeDrag(event, system.index, lane, point)}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedTrack && selectedSystem && (
        <div className="grid gap-3 rounded-md border bg-muted/10 p-3" data-testid="particle-timeline-inspector">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{selectedSystem.title}</div>
              <div className="text-[10px] text-muted-foreground">
                {selectedClip
                  ? 'Selected emission clip'
                  : selectedKeyframe && selectedLane
                    ? `${PARTICLE_TIMELINE_LANE_LABELS[selectedLane]} keyframe`
                    : selectedLane
                      ? `${PARTICLE_TIMELINE_LANE_LABELS[selectedLane]} lane`
                      : 'Selected emitter'}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addClipAt(selectedTrack.systemIndex)}>
                <PlusIcon className="size-3.5" />
                Add clip at playhead
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectSystem(selectedTrack.systemIndex)}>
                Select Emitter
              </Button>
            </div>
          </div>

          {selectedClip ? (
            <div className="grid gap-2">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Emit At
                  <ParticleNumberInput
                    aria-label="Emit at"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    max={timeline.duration}
                    value={selectedClip.start}
                    onValueChange={(value) => setClipValue(selectedTrack.systemIndex, selectedClip.id, 'start', value)}
                  />
                </label>
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Stop At
                  <ParticleNumberInput
                    aria-label="Stop at"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    max={timeline.duration}
                    value={selectedClip.end}
                    onValueChange={(value) => setClipValue(selectedTrack.systemIndex, selectedClip.id, 'end', value)}
                  />
                </label>
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Burst Particles
                  <ParticleNumberInput
                    aria-label="Burst particles"
                    className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                    min={0}
                    value={selectedClip.emit ?? 0}
                    onValueChange={(value) => setClipValue(selectedTrack.systemIndex, selectedClip.id, 'emit', value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => duplicateClip(selectedTrack.systemIndex, selectedClip)}
                >
                  <CopyIcon className="size-3.5" />
                  Duplicate clip
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                  onClick={() => deleteClip(selectedTrack.systemIndex, selectedClip.id)}
                >
                  <Trash2Icon className="size-3.5" />
                  Delete clip
                </Button>
              </div>
            </div>
          ) : selectedKeyframe && selectedLane ? (
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="grid gap-1 text-[10px] text-muted-foreground">
                Time
                <ParticleNumberInput
                  aria-label={`${PARTICLE_TIMELINE_LANE_LABELS[selectedLane]} key time`}
                  className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                  min={0}
                  max={timeline.duration}
                  value={selectedKeyframe.time}
                  onValueChange={(value) => updateKeyframe(selectedTrack.systemIndex, selectedLane, selectedKeyframe.id, 'time', value)}
                />
              </label>
              <label className="grid gap-1 text-[10px] text-muted-foreground">
                Value
                <ParticleNumberInput
                  aria-label={`${PARTICLE_TIMELINE_LANE_LABELS[selectedLane]} key value`}
                  className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                  value={selectedKeyframe.value}
                  onValueChange={(value) => updateKeyframe(selectedTrack.systemIndex, selectedLane, selectedKeyframe.id, 'value', value)}
                />
              </label>
              <label className="grid gap-1 text-[10px] text-muted-foreground">
                Curve to next key
                <Select
                  value={normalizeParticleTimelineEasing(selectedKeyframe.easing)}
                  disabled={!selectedKeyframeHasOutgoingSegment}
                  onValueChange={(value) =>
                    updateKeyframeEasing(
                      selectedTrack.systemIndex,
                      selectedLane,
                      selectedKeyframe.id,
                      value as ParticleTimelineEasing,
                    )
                  }
                >
                  <SelectTrigger aria-label={`${PARTICLE_TIMELINE_LANE_LABELS[selectedLane]} key curve`} className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTICLE_TIMELINE_EASINGS.map((easing) => (
                      <SelectItem key={easing} value={easing}>
                        {PARTICLE_TIMELINE_EASING_LABELS[easing]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button
                size="icon"
                variant="ghost"
                className="mt-4 size-8 text-destructive hover:text-destructive"
                title="Delete keyframe"
                onClick={() => deleteKeyframe(selectedTrack.systemIndex, selectedLane, selectedKeyframe.id)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ) : selectedLane ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => addKeyframeAt(selectedTrack.systemIndex, selectedLane)}
              >
                <PlusIcon className="size-3.5" />
                Add key at playhead
              </Button>
              <span className="text-xs text-muted-foreground">
                Double-click the lane to add a keyframe at any point in time.
              </span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Select a clip or lane to edit timing and keyframes. Double-click an empty track area to add a clip.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
