import { Label } from '@/components/ui/label';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useCallback, useEffect, useRef, useState } from 'react';

const H = 260;
const PAD = 24;
const TAU = Math.PI * 2;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

type DragTarget = 'direction' | 'spread-start' | 'spread-end';

function clampSpread(value: number): number {
  return Math.max(0, Math.min(TAU, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeDelta(value: number): number {
  let delta = value;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  return delta;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function rayPath(cx: number, cy: number, radius: number, angle: number): string {
  const point = polar(cx, cy, radius, angle);
  return `M ${cx} ${cy} L ${point.x} ${point.y}`;
}

function sectorPath(cx: number, cy: number, radius: number, start: number, end: number, spread: number): string {
  if (spread >= TAU - 0.001) {
    return [
      `M ${cx} ${cy}`,
      `m ${-radius} 0`,
      `a ${radius} ${radius} 0 1 0 ${radius * 2} 0`,
      `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`,
      'Z',
    ].join(' ');
  }

  const startPoint = polar(cx, cy, radius, start);
  const endPoint = polar(cx, cy, radius, end);
  const largeArc = spread > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`;
}

function angleFromPointer(
  event: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
  cx: number,
  cy: number,
): number {
  const rect = svg.getBoundingClientRect();
  return Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx);
}

export function DirectionSpreadGizmo({ system, onChange }: Props) {
  const direction = system.properties.direction ?? 0;
  const spread = clampSpread(system.properties.spread ?? 0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(360);
  const [dragging, setDragging] = useState<DragTarget | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setSvgW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cx = svgW / 2;
  const cy = H / 2;
  const radius = Math.max(40, Math.min(svgW - PAD * 2, H - PAD * 2) / 2);
  const startAngle = direction - spread / 2;
  const endAngle = direction + spread / 2;
  const directionPoint = polar(cx, cy, radius, direction);
  const startPoint = polar(cx, cy, radius, startAngle);
  const endPoint = polar(cx, cy, radius, endAngle);
  const stateRef = useRef({ cx, cy });
  stateRef.current = { cx, cy };

  const updateFromPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>, target: DragTarget) => {
      if (!svgRef.current) return;
      const { cx, cy } = stateRef.current;
      const angle = angleFromPointer(event, svgRef.current, cx, cy);

      if (target === 'direction') {
        onChange('direction', round(angle));
        return;
      }

      const delta = Math.abs(normalizeDelta(angle - direction));
      onChange('spread', round(clampSpread(delta * 2)));
    },
    [direction, onChange],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging) return;
      updateFromPointer(event, dragging);
    },
    [dragging, updateFromPointer],
  );

  const stopDrag = useCallback(() => setDragging(null), []);

  const beginDrag = (event: React.PointerEvent<SVGElement>, target: DragTarget) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(target);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Direction &amp; Spread
        </Label>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span>{round(direction)} rad</span>
          <span>{round(spread)} spread</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={H}
        className="touch-none rounded border bg-muted/10 select-none"
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeDasharray="3 4"
          strokeOpacity={0.1}
        />
        <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke="currentColor" strokeOpacity={0.12} />
        <line x1={cx} y1={cy - radius} x2={cx} y2={cy + radius} stroke="currentColor" strokeOpacity={0.12} />
        <text x={cx + radius - 12} y={cy - 5} fontSize={9} fill="currentColor" fillOpacity={0.35}>
          0
        </text>
        <text x={cx + 5} y={cy + radius - 6} fontSize={9} fill="currentColor" fillOpacity={0.35}>
          +π/2
        </text>

        <path d={sectorPath(cx, cy, radius, startAngle, endAngle, spread)} fill="var(--chart-2)" fillOpacity={0.12} />
        <path d={rayPath(cx, cy, radius, startAngle)} stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={rayPath(cx, cy, radius, endAngle)} stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={rayPath(cx, cy, radius, direction)} stroke="var(--chart-1)" strokeWidth={2.5} strokeLinecap="round" />

        <circle cx={cx} cy={cy} r={5} fill="currentColor" fillOpacity={0.4} />
        <circle
          cx={directionPoint.x}
          cy={directionPoint.y}
          r={7}
          fill={dragging === 'direction' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)"
          strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={(event) => beginDrag(event, 'direction')}
        />
        <text
          x={directionPoint.x + (directionPoint.x >= cx ? 10 : -10)}
          y={directionPoint.y - 5}
          fontSize={8}
          fill="var(--chart-1)"
          fillOpacity={0.8}
          textAnchor={directionPoint.x >= cx ? 'start' : 'end'}
        >
          dir
        </text>
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={6}
          fill={dragging === 'spread-start' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)"
          strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={(event) => beginDrag(event, 'spread-start')}
        />
        <text
          x={startPoint.x + (startPoint.x >= cx ? 9 : -9)}
          y={startPoint.y - 4}
          fontSize={8}
          fill="var(--chart-2)"
          fillOpacity={0.7}
          textAnchor={startPoint.x >= cx ? 'start' : 'end'}
        >
          start
        </text>
        <circle
          cx={endPoint.x}
          cy={endPoint.y}
          r={6}
          fill={dragging === 'spread-end' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)"
          strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={(event) => beginDrag(event, 'spread-end')}
        />
        <text
          x={endPoint.x + (endPoint.x >= cx ? 9 : -9)}
          y={endPoint.y - 4}
          fontSize={8}
          fill="var(--chart-2)"
          fillOpacity={0.7}
          textAnchor={endPoint.x >= cx ? 'start' : 'end'}
        >
          end
        </text>
      </svg>
    </div>
  );
}
