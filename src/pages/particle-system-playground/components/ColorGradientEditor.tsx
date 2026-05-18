import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { catmullRomPath } from './curveUtils';

type Stop = { r: number; g: number; b: number; a: number };

const ALPHA_H = 64;
const ALPHA_PAD = { top: 8, right: 8, bottom: 8, left: 8 };

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function parse(value: string): Stop[] {
  const nums = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite)
    .map(clamp);
  const stops: Stop[] = [];
  for (let i = 0; i + 3 < nums.length; i += 4) {
    stops.push({ r: nums[i], g: nums[i + 1], b: nums[i + 2], a: nums[i + 3] });
  }
  return stops.length ? stops : [{ r: 1, g: 1, b: 1, a: 1 }];
}

function serialize(stops: Stop[]) {
  return stops.flatMap((stop) => [stop.r, stop.g, stop.b, stop.a].map((value) => clamp(value).toFixed(3))).join(', ');
}

function hex(stop: Stop) {
  const part = (value: number) =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(stop.r)}${part(stop.g)}${part(stop.b)}`;
}

function fromHex(value: string) {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

export function ColorGradientEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const stops = parse(value);
  const [selected, setSelected] = useState(0);
  const [draggingAlpha, setDraggingAlpha] = useState<number | null>(null);
  const alphaRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [svgW, setSvgW] = useState(300);

  useEffect(() => {
    const el = alphaRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setSvgW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stop = stops[Math.min(selected, stops.length - 1)];

  const update = (index: number, patch: Partial<Stop>) => {
    onChange(serialize(stops.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))));
  };

  const innerW = svgW - ALPHA_PAD.left - ALPHA_PAD.right;
  const innerH = ALPHA_H - ALPHA_PAD.top - ALPHA_PAD.bottom;

  const alphaPoints = stops.map((s, i) => ({
    x: ALPHA_PAD.left + (stops.length === 1 ? innerW / 2 : (i / (stops.length - 1)) * innerW),
    y: ALPHA_PAD.top + (1 - s.a) * innerH,
  }));
  const alphaPath = catmullRomPath(alphaPoints);
  const baselineY = ALPHA_PAD.top + innerH;

  const onAlphaPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (draggingAlpha === null || !alphaRef.current) return;
      const rect = alphaRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const a = clamp(1 - (relY - ALPHA_PAD.top) / innerH);
      update(draggingAlpha, { a });
    },
    [draggingAlpha, stops, innerH],
  );

  const stopAlphaDrag = useCallback(() => setDraggingAlpha(null), []);

  // CSS gradient string for the color bar (with alpha, shown over checkerboard)
  const gradientCss = stops
    .map((s, i) => {
      const pct = stops.length === 1 ? '50%' : `${((i / (stops.length - 1)) * 100).toFixed(1)}%`;
      return `rgba(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)},${s.a.toFixed(3)}) ${pct}`;
    })
    .join(', ');

  return (
    <div className="grid gap-2">
      {/* Alpha curve */}
      <svg
        ref={alphaRef}
        width="100%"
        height={ALPHA_H}
        className="rounded border bg-card touch-none select-none"
        onPointerMove={onAlphaPointerMove}
        onPointerUp={stopAlphaDrag}
        onPointerLeave={stopAlphaDrag}
      >
        <line
          x1={ALPHA_PAD.left}
          y1={ALPHA_PAD.top + innerH * 0.5}
          x2={svgW - ALPHA_PAD.right}
          y2={ALPHA_PAD.top + innerH * 0.5}
          stroke="currentColor"
          strokeOpacity={0.07}
        />
        <line
          x1={ALPHA_PAD.left}
          y1={baselineY}
          x2={svgW - ALPHA_PAD.right}
          y2={baselineY}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="3 3"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            {stops.map((s, i) => (
              <stop
                key={i}
                offset={`${(stops.length === 1 ? 50 : (i / (stops.length - 1)) * 100).toFixed(1)}%`}
                stopColor={`rgb(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)})`}
                stopOpacity={0.5}
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={`${alphaPath} L ${alphaPoints[alphaPoints.length - 1].x} ${baselineY} L ${alphaPoints[0].x} ${baselineY} Z`}
          fill={`url(#${gradientId})`}
        />
        <path d={alphaPath} fill="none" stroke="var(--chart-2)" strokeWidth={1.5} strokeLinecap="round" />
        {alphaPoints.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={5}
            fill={selected === i ? 'var(--chart-2)' : 'hsl(var(--card))'}
            stroke="var(--chart-2)"
            strokeWidth={2}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDraggingAlpha(i);
              setSelected(i);
            }}
          />
        ))}
      </svg>

      {/* Color gradient bar with checkerboard for alpha visibility */}
      <div
        className="relative h-7 overflow-hidden rounded border"
        style={{
          backgroundImage: `linear-gradient(to right, ${gradientCss}), repeating-conic-gradient(#80808040 0% 25%, transparent 0% 50%)`,
          backgroundSize: '100% 100%, 8px 8px',
        }}
      >
        <div className="absolute inset-0 flex">
          {stops.map((_, index) => (
            <button
              key={index}
              className="min-w-6 flex-1"
              style={{ boxShadow: selected === index ? 'inset 0 0 0 2px white' : undefined }}
              onClick={() => setSelected(index)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_6rem_auto] items-end gap-2">
        <div className="grid gap-1">
          <Label className="text-[10px]">Color</Label>
          <input
            className="size-8 rounded border bg-transparent p-1"
            type="color"
            value={hex(stop)}
            onChange={(event) => {
              const color = fromHex(event.target.value);
              if (color) update(selected, color);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px]">Hex</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={hex(stop)}
            onChange={(event) => {
              const color = fromHex(event.target.value);
              if (color) update(selected, color);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px]">Alpha</Label>
          <Input
            className="h-8 text-xs"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={stop.a}
            onChange={(event) => update(selected, { a: clamp(Number(event.target.value)) })}
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            disabled={stops.length >= 8}
            onClick={() => {
              onChange(serialize([...stops, { ...stop }]));
              setSelected(stops.length);
            }}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            disabled={stops.length <= 1}
            onClick={() => {
              onChange(serialize(stops.filter((_, index) => index !== selected)));
              setSelected(Math.max(0, selected - 1));
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
