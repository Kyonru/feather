import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { catmullRomPath } from './curveUtils';

const PAD = { top: 8, right: 8, bottom: 8, left: 8 };
const SVG_H = 128;

function parse(value: string): number[] {
  const nums = value
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length ? nums : [1];
}

function serialize(values: number[]): string {
  return values.map((v) => Math.max(0, v).toFixed(3)).join(', ');
}

export function SizeCurveEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const values = parse(value);
  const count = values.length;
  const [dragging, setDragging] = useState<number | null>(null);
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

  const [axisMin, setAxisMin] = useState(0);
  const [axisMax, setAxisMax] = useState(() => Math.max(...parse(value), 1));

  const range = Math.max(axisMax - axisMin, 0.001);
  const innerW = svgW - PAD.left - PAD.right;
  const innerH = SVG_H - PAD.top - PAD.bottom;

  const toSvg = (i: number, v: number) => ({
    x: PAD.left + (count === 1 ? innerW / 2 : (i / (count - 1)) * innerW),
    y: PAD.top + (1 - (v - axisMin) / range) * innerH,
  });

  const points = values.map((v, i) => toSvg(i, v));
  const path = catmullRomPath(points);

  const baselineY = Math.max(PAD.top, Math.min(PAD.top + innerH, PAD.top + (1 - (0 - axisMin) / range) * innerH));

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragging === null || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const rawV = axisMin + (1 - (relY - PAD.top) / innerH) * range;
      const clamped = Math.max(axisMin, Math.min(axisMax, rawV));
      onChange(serialize(values.map((v, i) => (i === dragging ? clamped : v))));
    },
    [dragging, values, axisMin, axisMax, range, innerH, onChange],
  );

  const stopDrag = useCallback(() => setDragging(null), []);

  return (
    <div className="grid gap-1">
      <svg
        ref={svgRef}
        width="100%"
        height={SVG_H}
        className="rounded border bg-card touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            y1={PAD.top + (1 - t) * innerH}
            x2={svgW - PAD.right}
            y2={PAD.top + (1 - t) * innerH}
            stroke="currentColor"
            strokeOpacity={0.07}
          />
        ))}
        <line
          x1={PAD.left}
          y1={baselineY}
          x2={svgW - PAD.right}
          y2={baselineY}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="3 3"
        />
        <path
          d={`${path} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`}
          fill="var(--chart-1)"
          fillOpacity={0.15}
        />
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinecap="round" />
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={5}
            fill={dragging === i ? 'var(--chart-1)' : 'hsl(var(--card))'}
            stroke="var(--chart-1)"
            strokeWidth={2}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(i);
            }}
          />
        ))}
      </svg>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="shrink-0 text-[10px] text-muted-foreground">Min</span>
          <Input
            className="h-6 text-xs"
            type="number"
            step={0.1}
            min={0}
            value={axisMin}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v < axisMax) setAxisMin(v);
            }}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="shrink-0 text-[10px] text-muted-foreground">Max</span>
          <Input
            className="h-6 text-xs"
            type="number"
            step={0.1}
            min={0}
            value={axisMax}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > axisMin) setAxisMax(v);
            }}
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-6"
            disabled={count >= 8}
            onClick={() => onChange(serialize([...values, values[values.length - 1]]))}
          >
            <PlusIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-6"
            disabled={count <= 1}
            onClick={() => onChange(serialize(values.slice(0, -1)))}
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
