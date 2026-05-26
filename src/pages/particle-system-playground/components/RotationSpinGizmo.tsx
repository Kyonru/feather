import { Label } from '@/components/ui/label';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ParticleNumberInput } from './ParticleNumberInput';

const H = 260;
const PAD = 24;
const TAU = Math.PI * 2;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

type DragTarget = 'rotationMin' | 'rotationMax' | 'spinMin' | 'spinMax';

function clamp(value: number, range: number): number {
  return Math.max(-range, Math.min(range, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
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

function arcPath(cx: number, cy: number, radius: number, start: number, end: number) {
  const startPoint = polar(cx, cy, radius, start);
  const endPoint = polar(cx, cy, radius, end);
  let span = end - start;
  while (span < 0) span += TAU;
  const largeArc = span > Math.PI ? 1 : 0;
  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`;
}

export function RotationSpinGizmo({ system, onChange }: Props) {
  const p = system.properties;
  const rotationMin = p.rotationMin ?? 0;
  const rotationMax = p.rotationMax ?? 0;
  const spinMin = p.spinMin ?? 0;
  const spinMax = p.spinMax ?? 0;
  const spinVariation = p.spinVariation ?? 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(360);
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const maxAbsSpin = Math.max(Math.abs(spinMin), Math.abs(spinMax), 1);
  const [spinRange, setSpinRange] = useState(() => Math.ceil((maxAbsSpin * 1.35) / 5) * 5);
  const spinRangeWasEditedRef = useRef(false);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setSvgW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (spinRangeWasEditedRef.current) return;
    const nextRange = Math.ceil((maxAbsSpin * 1.35) / 5) * 5;
    setSpinRange((current) => (nextRange > current ? nextRange : current));
  }, [maxAbsSpin]);

  const cx = svgW / 2;
  const cy = 96;
  const radius = Math.max(54, Math.min(svgW - PAD * 2, 150) / 2);
  const minPoint = polar(cx, cy, radius, rotationMin);
  const maxPoint = polar(cx, cy, radius, rotationMax);
  const avgRotation = (rotationMin + rotationMax) / 2;
  const avgPoint = polar(cx, cy, radius * 0.72, avgRotation);
  const trackY = H - 42;
  const trackX1 = PAD;
  const trackX2 = svgW - PAD;
  const trackW = Math.max(1, trackX2 - trackX1);
  const spinToX = (value: number) => trackX1 + ((clamp(value, spinRange) + spinRange) / (spinRange * 2)) * trackW;
  const stateRef = useRef({ cx, cy, spinRange, trackX1, trackW });
  stateRef.current = { cx, cy, spinRange, trackX1, trackW };

  const updateSpinRange = useCallback(
    (nextRange: number) => {
      if (nextRange <= 0) return;
      spinRangeWasEditedRef.current = true;
      setSpinRange(nextRange);
      const values = {
        spinMin: clamp(spinMin, nextRange),
        spinMax: clamp(spinMax, nextRange),
      };
      Object.entries(values).forEach(([key, value]) => {
        const current = system.properties[key as keyof typeof system.properties] as number;
        if (current !== value) onChange(key, value);
      });
    },
    [onChange, spinMax, spinMin, system.properties],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !svgRef.current) return;
      const state = stateRef.current;
      const rect = svgRef.current.getBoundingClientRect();

      if (dragging === 'rotationMin' || dragging === 'rotationMax') {
        const angle = angleFromPointer(event, svgRef.current, state.cx, state.cy);
        onChange(dragging, round(angle));
        return;
      }

      const t = (event.clientX - rect.left - state.trackX1) / state.trackW;
      const value = clamp((t * 2 - 1) * state.spinRange, state.spinRange);
      onChange(dragging, round(value));
    },
    [dragging, onChange],
  );

  const beginDrag = (event: React.PointerEvent<SVGElement>, target: DragTarget) => {
    if (target === 'spinMin' || target === 'spinMax') spinRangeWasEditedRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(target);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Rotation &amp; Spin
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Spin ±</span>
          <ParticleNumberInput
            className="h-6 w-20 text-xs"
            min={0.1}
            step={1}
            value={spinRange}
            onValueChange={updateSpinRange}
          />
        </div>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={H}
        className="touch-none rounded border bg-muted/10 select-none"
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
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
        <path
          d={arcPath(cx, cy, radius, rotationMin, rotationMax)}
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth={7}
          strokeOpacity={0.16}
        />
        <path
          d={`M ${cx} ${cy} L ${avgPoint.x} ${avgPoint.y}`}
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <g transform={`translate(${cx} ${cy}) rotate(${(avgRotation * 180) / Math.PI})`}>
          <rect
            x="-18"
            y="-12"
            width="36"
            height="24"
            rx="4"
            fill="hsl(var(--card))"
            stroke="currentColor"
            strokeOpacity={0.35}
          />
          <path d="M 8 -7 L 20 0 L 8 7 Z" fill="var(--chart-1)" fillOpacity={0.75} />
        </g>
        <circle
          cx={minPoint.x}
          cy={minPoint.y}
          r={6}
          fill={dragging === 'rotationMin' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)"
          strokeWidth={2}
          onPointerDown={(event) => beginDrag(event, 'rotationMin')}
        />
        <text
          x={minPoint.x + (minPoint.x >= cx ? 9 : -9)}
          y={minPoint.y - 4}
          fontSize={8}
          fill="var(--chart-2)"
          fillOpacity={0.75}
          textAnchor={minPoint.x >= cx ? 'start' : 'end'}
        >
          min
        </text>
        <circle
          cx={maxPoint.x}
          cy={maxPoint.y}
          r={6}
          fill={dragging === 'rotationMax' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)"
          strokeWidth={2}
          strokeDasharray="3 2"
          onPointerDown={(event) => beginDrag(event, 'rotationMax')}
        />
        <text
          x={maxPoint.x + (maxPoint.x >= cx ? 9 : -9)}
          y={maxPoint.y - 4}
          fontSize={8}
          fill="var(--chart-2)"
          fillOpacity={0.75}
          textAnchor={maxPoint.x >= cx ? 'start' : 'end'}
        >
          max
        </text>

        <line
          x1={trackX1}
          y1={trackY}
          x2={trackX2}
          y2={trackY}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <line
          x1={spinToX(-spinVariation * spinRange)}
          y1={trackY - 10}
          x2={spinToX(spinVariation * spinRange)}
          y2={trackY - 10}
          stroke="var(--chart-3)"
          strokeOpacity={0.45}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <text x={trackX1} y={trackY + 22} fontSize={9} fill="currentColor" fillOpacity={0.45}>
          CCW
        </text>
        <text x={cx - 4} y={trackY + 22} fontSize={9} fill="currentColor" fillOpacity={0.45}>
          0
        </text>
        <text x={trackX2 - 18} y={trackY + 22} fontSize={9} fill="currentColor" fillOpacity={0.45}>
          CW
        </text>
        <circle
          cx={spinToX(spinMin)}
          cy={trackY}
          r={6}
          fill={dragging === 'spinMin' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)"
          strokeWidth={2}
          onPointerDown={(event) => beginDrag(event, 'spinMin')}
        />
        <text
          x={spinToX(spinMin)}
          y={trackY - 11}
          fontSize={8}
          fill="var(--chart-1)"
          fillOpacity={0.75}
          textAnchor="middle"
        >
          min
        </text>
        <circle
          cx={spinToX(spinMax)}
          cy={trackY}
          r={6}
          fill={dragging === 'spinMax' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)"
          strokeWidth={2}
          strokeDasharray="3 2"
          onPointerDown={(event) => beginDrag(event, 'spinMax')}
        />
        <text
          x={spinToX(spinMax)}
          y={trackY - 11}
          fontSize={8}
          fill="var(--chart-1)"
          fillOpacity={0.75}
          textAnchor="middle"
        >
          max
        </text>
      </svg>
    </div>
  );
}
