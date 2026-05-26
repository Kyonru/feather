import { Label } from '@/components/ui/label';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useEffect, useRef, useState } from 'react';
import { ParticleNumberInput } from './ParticleNumberInput';

const H = 100;
const PAD = { top: 10, right: 12, bottom: 10, left: 12 };
const STEPS = 60;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

function decayCurve(svgW: number, dampingValue: number): string {
  const innerW = svgW - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const points: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const v = Math.exp(-dampingValue * t * 3);
    const x = PAD.left + t * innerW;
    const y = PAD.top + (1 - v) * innerH;
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function DampingRangeEditor({ system, onChange }: Props) {
  const p = system.properties;
  const dampMin = p.linearDampingMin ?? 0;
  const dampMax = p.linearDampingMax ?? 0;

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

  const innerW = svgW - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const minPath = decayCurve(svgW, dampMin);
  const maxPath = decayCurve(svgW, dampMax);

  // Fill area between the two curves
  const minPoints: { x: number; y: number }[] = [];
  const maxPointsRev: { x: number; y: number }[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = PAD.left + t * innerW;
    minPoints.push({ x, y: PAD.top + (1 - Math.exp(-dampMin * t * 3)) * innerH });
    maxPointsRev.push({ x, y: PAD.top + (1 - Math.exp(-dampMax * t * 3)) * innerH });
  }
  const bandPath =
    minPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ' ' +
    maxPointsRev
      .slice()
      .reverse()
      .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ') +
    ' Z';

  return (
    <div className="grid gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Damping</span>

      <svg ref={svgRef} width="100%" height={H} className="rounded border bg-card select-none">
        {/* Guide lines at 25%, 50%, 75% velocity */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            y1={PAD.top + (1 - t) * innerH}
            x2={svgW - PAD.right}
            y2={PAD.top + (1 - t) * innerH}
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeDasharray="3 3"
          />
        ))}

        {/* Baseline (velocity = 0) */}
        <line
          x1={PAD.left}
          y1={PAD.top + innerH}
          x2={svgW - PAD.right}
          y2={PAD.top + innerH}
          stroke="currentColor"
          strokeOpacity={0.15}
        />

        {/* Band between min and max curves */}
        <path d={bandPath} fill="var(--chart-1)" fillOpacity={0.1} />

        {/* Min curve */}
        <path
          d={minPath}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          strokeOpacity={0.6}
          strokeLinecap="round"
        />
        <text
          x={svgW - PAD.right - 2}
          y={minPoints[STEPS].y - 3}
          fontSize={8}
          fill="var(--chart-1)"
          fillOpacity={0.65}
          textAnchor="end"
        >
          min
        </text>

        {/* Max curve */}
        <path
          d={maxPath}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeOpacity={0.9}
          strokeLinecap="round"
        />
        <text
          x={svgW - PAD.right - 2}
          y={maxPointsRev[STEPS].y - 3}
          fontSize={8}
          fill="var(--chart-1)"
          fillOpacity={0.9}
          textAnchor="end"
        >
          max
        </text>

        {/* Axis labels */}
        <text x={PAD.left} y={PAD.top - 1} fontSize={8} fill="currentColor" fillOpacity={0.35}>
          1.0
        </text>
        <text x={PAD.left} y={PAD.top + innerH * 0.5 + 3} fontSize={8} fill="currentColor" fillOpacity={0.25}>
          0.5
        </text>
        <text x={svgW - PAD.right - 6} y={PAD.top + 8} fontSize={8} fill="currentColor" fillOpacity={0.25}>
          t
        </text>
        <text x={PAD.left} y={H - 2} fontSize={8} fill="currentColor" fillOpacity={0.25}>
          velocity decay
        </text>
      </svg>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Damping Min</Label>
          <ParticleNumberInput
            className="h-8 text-xs"
            step={0.01}
            min={0}
            value={dampMin}
            onValueChange={(value) => onChange('linearDampingMin', value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Damping Max</Label>
          <ParticleNumberInput
            className="h-8 text-xs"
            step={0.01}
            min={0}
            value={dampMax}
            onValueChange={(value) => onChange('linearDampingMax', value)}
          />
        </div>
      </div>
    </div>
  );
}
