import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useCallback, useEffect, useRef, useState } from 'react';

const H = 200;
const PAD = 20;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

type ArtistState = { direction: number; spread: number; speedMin: number; speedMax: number };

function rawToArtist(minX: number, minY: number, maxX: number, maxY: number): ArtistState {
  const minAngle = Math.atan2(minY, minX);
  const maxAngle = Math.atan2(maxY, maxX);
  let diff = maxAngle - minAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return {
    direction: minAngle + diff / 2,
    spread: Math.abs(diff),
    speedMin: Math.hypot(minX, minY),
    speedMax: Math.hypot(maxX, maxY),
  };
}

function artistToRaw({ direction, spread, speedMin, speedMax }: ArtistState) {
  const a0 = direction - spread / 2;
  const a1 = direction + spread / 2;
  return {
    linearAccelXMin: Math.cos(a0) * speedMin,
    linearAccelYMin: Math.sin(a0) * speedMin,
    linearAccelXMax: Math.cos(a1) * speedMax,
    linearAccelYMax: Math.sin(a1) * speedMax,
  };
}

function niceInterval(range: number): number {
  const raw = range / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 2) return mag;
  if (norm < 5) return 2 * mag;
  return 5 * mag;
}

function arrowHead(x: number, y: number, angle: number, size = 6): string {
  const a1 = angle + 2.5;
  const a2 = angle - 2.5;
  return `M ${x} ${y} L ${x + Math.cos(a1) * size} ${y + Math.sin(a1) * size} M ${x} ${y} L ${x + Math.cos(a2) * size} ${y + Math.sin(a2) * size}`;
}

export function LinearAccelPlane({ system, onChange }: Props) {
  const p = system.properties;
  const minX = p.linearAccelXMin ?? 0;
  const minY = p.linearAccelYMin ?? 0;
  const maxX = p.linearAccelXMax ?? 0;
  const maxY = p.linearAccelYMax ?? 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(300);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setSvgW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [inputMode, setInputMode] = useState<'raw' | 'artist'>('raw');
  const [artist, setArtist] = useState<ArtistState>(() => rawToArtist(minX, minY, maxX, maxY));

  const maxVal = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY), 50);
  const [range, setRange] = useState(() => Math.ceil(maxVal * 1.5 / 50) * 50);

  const cx = svgW / 2;
  const cy = H / 2;
  const innerR = Math.min(svgW - PAD * 2, H - PAD * 2) / 2;
  const scale = innerR / range;

  const stateRef = useRef({ cx, cy, scale });
  stateRef.current = { cx, cy, scale };

  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !svgRef.current) return;
      const { cx, cy, scale } = stateRef.current;
      const rect = svgRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left - cx) / scale;
      const py = (e.clientY - rect.top - cy) / scale;
      const round = (v: number) => Math.round(v * 10) / 10;
      if (dragging === 'min') {
        onChange('linearAccelXMin', round(px));
        onChange('linearAccelYMin', round(py));
      } else {
        onChange('linearAccelXMax', round(px));
        onChange('linearAccelYMax', round(py));
      }
    },
    [dragging, onChange],
  );

  const stopDrag = useCallback(() => setDragging(null), []);

  const toSvg = (px: number, py: number) => ({ x: cx + px * scale, y: cy + py * scale });

  const minPt = toSvg(minX, minY);
  const maxPt = toSvg(maxX, maxY);
  const origin = toSvg(0, 0);

  const interval = niceInterval(range);
  const gridVals: number[] = [];
  for (let v = interval; v < range; v += interval) {
    gridVals.push(v);
    gridVals.push(-v);
  }

  const minAngle = Math.atan2(minY, minX);
  const maxAngle = Math.atan2(maxY, maxX);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Linear Acceleration</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Range ±</span>
          <Input
            className="h-6 w-20 text-xs"
            type="number"
            step={50}
            min={10}
            value={range}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) setRange(v); }}
          />
        </div>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={H}
        className="rounded border bg-card touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {/* Grid lines */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={PAD} y1={cy + v * scale} x2={svgW - PAD} y2={cy + v * scale} stroke="currentColor" strokeOpacity={0.07} />
            <line x1={cx + v * scale} y1={PAD} x2={cx + v * scale} y2={H - PAD} stroke="currentColor" strokeOpacity={0.07} />
            <text x={cx + v * scale + 2} y={cy - 3} fontSize={8} fill="currentColor" fillOpacity={0.3}>{v}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD} y1={cy} x2={svgW - PAD} y2={cy} stroke="currentColor" strokeOpacity={0.25} />
        <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="currentColor" strokeOpacity={0.25} />
        <text x={svgW - PAD - 10} y={cy - 4} fontSize={9} fill="currentColor" fillOpacity={0.4}>X</text>
        <text x={cx + 4} y={PAD + 10} fontSize={9} fill="currentColor" fillOpacity={0.4}>Y</text>

        {/* Min vector */}
        <line x1={origin.x} y1={origin.y} x2={minPt.x} y2={minPt.y} stroke="var(--chart-1)" strokeWidth={1.5} />
        <path d={arrowHead(minPt.x, minPt.y, minAngle)} stroke="var(--chart-1)" strokeWidth={1.5} fill="none" strokeLinecap="round" />

        {/* Max vector */}
        <line x1={origin.x} y1={origin.y} x2={maxPt.x} y2={maxPt.y} stroke="var(--chart-2)" strokeWidth={1.5} />
        <path d={arrowHead(maxPt.x, maxPt.y, maxAngle)} stroke="var(--chart-2)" strokeWidth={1.5} fill="none" strokeLinecap="round" />

        {/* Origin */}
        <circle cx={origin.x} cy={origin.y} r={3} fill="currentColor" fillOpacity={0.4} />

        {/* Handles */}
        <circle
          cx={minPt.x} cy={minPt.y} r={6}
          fill={dragging === 'min' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)" strokeWidth={2} style={{ cursor: 'grab' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('min'); }}
        />
        <circle
          cx={maxPt.x} cy={maxPt.y} r={6}
          fill={dragging === 'max' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)" strokeWidth={2} style={{ cursor: 'grab' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('max'); }}
        />

        {/* Legend */}
        <circle cx={PAD} cy={H - PAD + 2} r={4} fill="var(--chart-1)" />
        <text x={PAD + 7} y={H - PAD + 6} fontSize={9} fill="currentColor" fillOpacity={0.5}>min</text>
        <circle cx={PAD + 35} cy={H - PAD + 2} r={4} fill="var(--chart-2)" />
        <text x={PAD + 42} y={H - PAD + 6} fontSize={9} fill="currentColor" fillOpacity={0.5}>max</text>
      </svg>

      {/* Input mode tabs */}
      <ToggleGroup
        type="single"
        value={inputMode}
        onValueChange={(v) => {
          if (!v) return;
          if (v === 'artist') setArtist(rawToArtist(minX, minY, maxX, maxY));
          setInputMode(v as 'raw' | 'artist');
        }}
        className="h-6 w-fit"
      >
        <ToggleGroupItem value="raw" className="h-6 px-2 text-[10px]">Raw</ToggleGroupItem>
        <ToggleGroupItem value="artist" className="h-6 px-2 text-[10px]">Artist</ToggleGroupItem>
      </ToggleGroup>

      {inputMode === 'raw' ? (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Min X', key: 'linearAccelXMin', val: minX },
            { label: 'Min Y', key: 'linearAccelYMin', val: minY },
            { label: 'Max X', key: 'linearAccelXMax', val: maxX },
            { label: 'Max Y', key: 'linearAccelYMax', val: maxY },
          ].map(({ label, key, val }) => (
            <div key={key} className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">{label}</Label>
              <Input className="h-8 text-xs" type="number" step={1} value={val}
                onChange={(e) => onChange(key, Number(e.target.value))} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: 'Direction (rad)', key: 'direction', step: 0.01 },
            { label: 'Spread (rad)', key: 'spread', step: 0.01, min: 0 },
            { label: 'Speed Min', key: 'speedMin', step: 1, min: 0 },
            { label: 'Speed Max', key: 'speedMax', step: 1, min: 0 },
          ] as { label: string; key: keyof ArtistState; step: number; min?: number }[]).map(({ label, key, step, min }) => (
            <div key={key} className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">{label}</Label>
              <Input
                className="h-8 text-xs" type="number" step={step} min={min}
                value={artist[key]}
                onChange={(e) => {
                  const updated = { ...artist, [key]: Number(e.target.value) };
                  setArtist(updated);
                  const raw = artistToRaw(updated);
                  Object.entries(raw).forEach(([k, v]) => onChange(k, Math.round(v * 10) / 10));
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
