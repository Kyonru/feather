import { Label } from '@feather/ui/label';
import type { ParticleSystemPlaygroundSystem } from '@studio/types/particle-system-playground';
import { ParticleNumberInput } from './ParticleNumberInput';

type Props = {
  label: string;
  minKey: string;
  maxKey: string;
  system: ParticleSystemPlaygroundSystem;
  systemId: number;
  onChange: (key: string, value: string | number | boolean) => void;
  step?: number;
};

function getValue(system: ParticleSystemPlaygroundSystem, key: string): number {
  return (system.properties[key as keyof typeof system.properties] as number) ?? 0;
}

export function RangePairField({ label, minKey, maxKey, system, systemId, onChange, step = 1 }: Props) {
  const minVal = getValue(system, minKey);
  const maxVal = getValue(system, maxKey);

  return (
    <div className="col-span-2 grid gap-1">
      <Label className="text-[10px] text-muted-foreground font-semibold">{label}</Label>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Label htmlFor={`particle-${systemId}-${minKey}`} className="text-[10px] font-medium text-muted-foreground">
          Min <span className="sr-only">{label}</span>
        </Label>
        <ParticleNumberInput
          id={`particle-${systemId}-${minKey}`}
          aria-label={`${label} minimum`}
          className="h-8 text-xs"
          step={step}
          value={minVal}
          onValueChange={(value) => onChange(minKey, value)}
        />
        <Label htmlFor={`particle-${systemId}-${maxKey}`} className="text-[10px] font-medium text-muted-foreground">
          Max <span className="sr-only">{label}</span>
        </Label>
        <ParticleNumberInput
          id={`particle-${systemId}-${maxKey}`}
          aria-label={`${label} maximum`}
          className="h-8 text-xs"
          step={step}
          value={maxVal}
          onValueChange={(value) => onChange(maxKey, value)}
        />
      </div>
    </div>
  );
}
