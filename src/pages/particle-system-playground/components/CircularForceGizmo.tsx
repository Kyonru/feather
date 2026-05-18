import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useCallback, useEffect, useRef, useState } from 'react';

const H = 180;
const EMITTER_R = 18;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

// Build a curved arrow path along a circle arc (for tangential indicators)
function arcArrow(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const sx = cx + Math.cos(startAngle) * r;
  const sy = cy + Math.sin(startAngle) * r;
  const ex = cx + Math.cos(endAngle) * r;
  const ey = cy + Math.sin(endAngle) * r;
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
}

export function CircularForceGizmo({ system, onChange }: Props) {
  const p = system.properties;
  const radialMin = p.radialAccelMin ?? 0;
  const radialMax = p.radialAccelMax ?? 0;
  const tangMin = p.tangentialAccelMin ?? 0;
  const tangMax = p.tangentialAccelMax ?? 0;

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

  const cx = svgW / 2;
  const cy = H / 2;

  const maxAbs = Math.max(Math.abs(radialMin), Math.abs(radialMax), Math.abs(tangMin), Math.abs(tangMax), 50);
  const [range, setRange] = useState(() => Math.ceil(maxAbs * 1.5 / 50) * 50);
  const halfSide = Math.min(svgW, H) / 2 - 24;
  const scale = halfSide / range;

  const stateRef = useRef({ cx, cy, scale, range });
  stateRef.current = { cx, cy, scale, range };

  type DragTarget = 'radialMin' | 'radialMax' | 'tangMin' | 'tangMax';
  const [dragging, setDragging] = useState<DragTarget | null>(null);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !svgRef.current) return;
      const { cx, cy, scale } = stateRef.current;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = e.clientX - rect.left - cx;
      const dy = e.clientY - rect.top - cy;
      const round = (v: number) => Math.round(v * 10) / 10;

      const { range } = stateRef.current;
      const clamp = (v: number) => Math.max(-range, Math.min(range, v));
      if (dragging === 'radialMin' || dragging === 'radialMax') {
        const v = round(clamp(dx / scale));
        onChange(dragging === 'radialMin' ? 'radialAccelMin' : 'radialAccelMax', v);
      } else {
        const v = round(clamp(dy / scale));
        onChange(dragging === 'tangMin' ? 'tangentialAccelMin' : 'tangentialAccelMax', v);
      }
    },
    [dragging, onChange],
  );

  const stopDrag = useCallback(() => setDragging(null), []);

  // Radial handle positions: along horizontal axis
  const radialMinX = cx + radialMin * scale;
  const radialMaxX = cx + radialMax * scale;
  // Tangential handle positions: along vertical axis
  const tangMinY = cy + tangMin * scale;
  const tangMaxY = cy + tangMax * scale;

  // Decorative: show 8 radial arrows around the emitter circle
  const avgRadial = (radialMin + radialMax) / 2;
  const avgTang = (tangMin + tangMax) / 2;

  const arrows8 = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 2 * Math.PI;
    const baseR = EMITTER_R + 4;
    const tipR = baseR + Math.min(Math.abs(avgRadial) * scale * 0.4, 28) + 4;
    const dir = avgRadial >= 0 ? 1 : -1; // outward or inward
    const bx = cx + Math.cos(angle) * baseR;
    const by = cy + Math.sin(angle) * baseR;
    const ax = cx + Math.cos(angle) * (EMITTER_R + 4 + (dir > 0 ? tipR - baseR : 0));
    const ay = cy + Math.sin(angle) * (EMITTER_R + 4 + (dir > 0 ? tipR - baseR : 0));
    return { bx, by, tx: ax, ty: ay, angle: dir > 0 ? angle : angle + Math.PI };
  });

  // Tangential arc display
  const tangArcR = EMITTER_R + 12;
  const tangStrength = Math.abs(avgTang);
  const tangArcSpan = Math.min((tangStrength / range) * Math.PI * 1.5 + 0.3, Math.PI * 1.8);
  const tangCW = avgTang >= 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Radial &amp; Tangential</span>
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
        {/* Reference circles */}
        {[0.33, 0.66, 1].map((t) => (
          <circle key={t} cx={cx} cy={cy} r={halfSide * t}
            fill="none" stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3 3" />
        ))}

        {/* Axes */}
        <line x1={cx - halfSide} y1={cy} x2={cx + halfSide} y2={cy} stroke="currentColor" strokeOpacity={0.15} />
        <line x1={cx} y1={cy - halfSide} x2={cx} y2={cy + halfSide} stroke="currentColor" strokeOpacity={0.15} />
        <text x={cx + halfSide - 12} y={cy - 4} fontSize={8} fill="currentColor" fillOpacity={0.35}>radial</text>
        <text x={cx + 4} y={cy - halfSide + 10} fontSize={8} fill="currentColor" fillOpacity={0.35}>tang</text>

        {/* Radial arrows around emitter */}
        {arrows8.map(({ bx, by, tx, ty, angle }, i) => (
          <g key={i}>
            <line x1={bx} y1={by} x2={tx} y2={ty} stroke="var(--chart-1)" strokeOpacity={0.5} strokeWidth={1.5} />
            <path
              d={`M ${tx} ${ty} L ${tx + Math.cos(angle + 2.5) * 5} ${ty + Math.sin(angle + 2.5) * 5} M ${tx} ${ty} L ${tx + Math.cos(angle - 2.5) * 5} ${ty + Math.sin(angle - 2.5) * 5}`}
              stroke="var(--chart-1)" strokeOpacity={0.5} strokeWidth={1} fill="none" strokeLinecap="round"
            />
          </g>
        ))}

        {/* Tangential arc arrows */}
        {tangStrength > 1 && (
          <>
            <path
              d={arcArrow(cx, cy, tangArcR, -Math.PI / 2, -Math.PI / 2 + (tangCW ? tangArcSpan : -tangArcSpan))}
              fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeOpacity={0.6} strokeLinecap="round"
            />
            {/* arrowhead at end of arc */}
            {(() => {
              const endAngle = -Math.PI / 2 + (tangCW ? tangArcSpan : -tangArcSpan);
              const ex = cx + Math.cos(endAngle) * tangArcR;
              const ey = cy + Math.sin(endAngle) * tangArcR;
              const ta = endAngle + (tangCW ? Math.PI / 2 : -Math.PI / 2);
              return (
                <path
                  d={`M ${ex} ${ey} L ${ex + Math.cos(ta + 2.5) * 6} ${ey + Math.sin(ta + 2.5) * 6} M ${ex} ${ey} L ${ex + Math.cos(ta - 2.5) * 6} ${ey + Math.sin(ta - 2.5) * 6}`}
                  stroke="var(--chart-2)" strokeWidth={1.5} strokeOpacity={0.6} fill="none" strokeLinecap="round"
                />
              );
            })()}
          </>
        )}

        {/* Emitter circle */}
        <circle cx={cx} cy={cy} r={EMITTER_R} fill="hsl(var(--card))" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={3} fill="currentColor" fillOpacity={0.4} />

        {/* Radial handles (horizontal axis) */}
        <circle cx={radialMinX} cy={cy} r={6}
          fill={dragging === 'radialMin' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)" strokeWidth={2} style={{ cursor: 'ew-resize' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('radialMin'); }}
        />
        <circle cx={radialMaxX} cy={cy} r={6}
          fill={dragging === 'radialMax' ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="3 2" style={{ cursor: 'ew-resize' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('radialMax'); }}
        />

        {/* Tangential handles (vertical axis) */}
        <circle cx={cx} cy={tangMinY} r={6}
          fill={dragging === 'tangMin' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)" strokeWidth={2} style={{ cursor: 'ns-resize' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('tangMin'); }}
        />
        <circle cx={cx} cy={tangMaxY} r={6}
          fill={dragging === 'tangMax' ? 'var(--chart-2)' : 'hsl(var(--card))'}
          stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="3 2" style={{ cursor: 'ns-resize' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('tangMax'); }}
        />

        {/* Legends */}
        <circle cx={20} cy={H - 14} r={4} fill="var(--chart-1)" />
        <text x={28} y={H - 10} fontSize={9} fill="currentColor" fillOpacity={0.5}>radial (± outward)</text>
        <circle cx={120} cy={H - 14} r={4} fill="var(--chart-2)" />
        <text x={128} y={H - 10} fontSize={9} fill="currentColor" fillOpacity={0.5}>tang (± CW)</text>
      </svg>

      <div className="grid grid-cols-2 gap-2">
        {([
          { label: 'Radial Min', key: 'radialAccelMin', val: radialMin },
          { label: 'Radial Max', key: 'radialAccelMax', val: radialMax },
          { label: 'Tang Min', key: 'tangentialAccelMin', val: tangMin },
          { label: 'Tang Max', key: 'tangentialAccelMax', val: tangMax },
        ]).map(({ label, key, val }) => (
          <div key={key} className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">{label}</Label>
            <Input className="h-8 text-xs" type="number" step={1} value={val}
              onChange={(e) => onChange(key, Number(e.target.value))} />
          </div>
        ))}
      </div>
    </div>
  );
}
