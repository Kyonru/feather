import { Label } from '@/components/ui/label';
import { useConfigStore } from '@/store/config';
import { useSettingsStore } from '@/store/settings';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { isWeb } from '@/utils/platform';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ParticleNumberInput } from './ParticleNumberInput';

const H = 220;
const PAD = 26;

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

function clamp(value: number, range: number): number {
  return Math.max(-range, Math.min(range, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveAssetPath(src: string, sourceDir: string): string {
  if (!sourceDir || src.startsWith('data:') || src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src)) {
    return src;
  }
  return sourceDir.replace(/[/\\]+$/, '') + '/' + src;
}

function canResolveAssetPath(src: string, sourceDir: string): boolean {
  return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src) || !!sourceDir;
}

function svgPointFromPointer(event: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return point.matrixTransform(matrix.inverse());
}

function TextureFallback({ preset, cx, cy, size }: { preset: string; cx: number; cy: number; size: number }) {
  const r = size * 0.3;
  if (preset === 'ring') {
    return (
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-1)" strokeWidth={size * 0.12} opacity={0.75} />
    );
  }
  if (preset === 'star') {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
      const radius = index % 2 === 0 ? r : r * 0.45;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(' ');
    return <polygon points={points} fill="var(--chart-1)" opacity={0.78} />;
  }
  if (preset === 'spiral') {
    return (
      <path
        d={`M ${cx - r * 0.8} ${cy} C ${cx - r * 0.4} ${cy - r} ${cx + r} ${cy - r * 0.5} ${cx + r * 0.45} ${cy + r * 0.1} C ${cx} ${cy + r * 0.6} ${cx - r * 0.1} ${cy - r * 0.25} ${cx + r * 0.45} ${cy - r * 0.2}`}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={size * 0.1}
        strokeLinecap="round"
        opacity={0.78}
      />
    );
  }
  if (preset === 'light') {
    return (
      <>
        <circle cx={cx} cy={cy} r={r * 1.1} fill="var(--chart-1)" opacity={0.14} />
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--chart-1)" opacity={0.62} />
      </>
    );
  }
  return <circle cx={cx} cy={cy} r={r} fill="var(--chart-1)" opacity={0.75} />;
}

export function TextureOffsetGizmo({ system, onChange }: Props) {
  const offsetX = system.properties.offsetX ?? 0;
  const offsetY = system.properties.offsetY ?? 0;
  const manualSourceDir = useSettingsStore((state) => state.assetSourceDir);
  const configSourceDir = useConfigStore((state) => state.config?.sourceDir ?? '');
  const sourceDir = manualSourceDir || configSourceDir;
  const svgRef = useRef<SVGSVGElement>(null);
  const maxAbs = Math.max(Math.abs(offsetX), Math.abs(offsetY), 32);
  const [range, setRange] = useState(() => Math.ceil((maxAbs * 1.25) / 16) * 16);
  const [dragging, setDragging] = useState(false);
  const cx = 150;
  const cy = H / 2;
  const previewSize = Math.min(128, H - PAD * 2);
  const previewX = cx - previewSize / 2;
  const previewY = cy - previewSize / 2;
  const scale = previewSize / (range * 2);
  const anchorX = cx + clamp(offsetX, range) * scale;
  const anchorY = cy + clamp(offsetY, range) * scale;
  const textureSrc = useMemo(() => {
    if (!system.texturePath || isWeb() || !canResolveAssetPath(system.texturePath, sourceDir)) return '';
    return convertFileSrc(resolveAssetPath(system.texturePath, sourceDir));
  }, [sourceDir, system.texturePath]);

  const updateRange = useCallback(
    (nextRange: number) => {
      if (nextRange <= 0) return;
      setRange(nextRange);
      const values = {
        offsetX: clamp(offsetX, nextRange),
        offsetY: clamp(offsetY, nextRange),
      };
      Object.entries(values).forEach(([key, value]) => {
        const current = system.properties[key as keyof typeof system.properties] as number;
        if (current !== value) onChange(key, value);
      });
    },
    [offsetX, offsetY, onChange, system.properties],
  );

  const updateFromPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current || !dragging) return;
      const point = svgPointFromPointer(event, svgRef.current);
      if (!point) return;
      const nextX = clamp((point.x - cx) / scale, range);
      const nextY = clamp((point.y - cy) / scale, range);
      onChange('offsetX', round(nextX));
      onChange('offsetY', round(nextY));
    },
    [cx, cy, dragging, onChange, range, scale],
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Texture Anchor</Label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Range ±</span>
          <ParticleNumberInput
            className="h-6 w-20 text-xs"
            min={1}
            step={8}
            value={range}
            onValueChange={updateRange}
          />
        </div>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 300 ${H}`}
        className="touch-none rounded border bg-muted/10 select-none"
        onPointerMove={updateFromPointer}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      >
        <defs>
          <pattern id="texture-offset-checker" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="hsl(var(--card))" />
            <rect width="6" height="6" fill="currentColor" opacity={0.05} />
            <rect x="6" y="6" width="6" height="6" fill="currentColor" opacity={0.05} />
          </pattern>
          <clipPath id="texture-offset-preview-clip">
            <rect x={previewX} y={previewY} width={previewSize} height={previewSize} rx={8} />
          </clipPath>
        </defs>
        <rect
          x={previewX}
          y={previewY}
          width={previewSize}
          height={previewSize}
          rx={8}
          fill="url(#texture-offset-checker)"
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {textureSrc ? (
          <image
            href={textureSrc}
            x={previewX}
            y={previewY}
            width={previewSize}
            height={previewSize}
            preserveAspectRatio="xMidYMid meet"
            clipPath="url(#texture-offset-preview-clip)"
          />
        ) : (
          <TextureFallback preset={system.texturePreset} cx={cx} cy={cy} size={previewSize} />
        )}
        <path
          d={`M ${previewX} ${cy} H ${previewX + previewSize} M ${cx} ${previewY} V ${previewY + previewSize}`}
          stroke="currentColor"
          strokeOpacity={0.16}
          strokeDasharray="4 4"
        />
        <circle cx={cx} cy={cy} r={4} fill="currentColor" fillOpacity={0.35} />
        <line x1={cx} y1={cy} x2={anchorX} y2={anchorY} stroke="var(--chart-1)" strokeWidth={2} strokeOpacity={0.7} />
        <circle
          cx={anchorX}
          cy={anchorY}
          r={8}
          fill={dragging ? 'var(--chart-1)' : 'hsl(var(--card))'}
          stroke="var(--chart-1)"
          strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
        />
        <text x={previewX} y={previewY + previewSize + 18} fontSize={10} fill="currentColor" fillOpacity={0.5}>
          origin
        </text>
        <text x={anchorX + 10} y={anchorY - 8} fontSize={10} fill="currentColor" fillOpacity={0.55}>
          offset
        </text>
      </svg>
    </div>
  );
}
