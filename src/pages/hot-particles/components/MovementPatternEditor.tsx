import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HotParticlesMovement, MovementPattern } from '@/types/hot-particles';

type Props = {
  movement: HotParticlesMovement;
  disabled?: boolean;
  onChange: (key: string, value: string | number) => void;
};

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className="h-8 text-xs" type="number" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function MovementPatternEditor({ movement, disabled, onChange }: Props) {
  const pattern = movement.pattern ?? 'none';

  return (
    <div className="grid gap-2">
      <Select
        value={pattern}
        disabled={disabled}
        onValueChange={(value) => onChange('movement.pattern', value as MovementPattern)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="circle">Circle</SelectItem>
          <SelectItem value="figure-eight">Figure Eight</SelectItem>
          <SelectItem value="irregular">Irregular</SelectItem>
        </SelectContent>
      </Select>
      {pattern === 'circle' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Radius" value={movement.radius} onChange={(value) => onChange('movement.radius', value)} />
          <NumberField label="Speed" value={movement.speed} onChange={(value) => onChange('movement.speed', value)} />
        </div>
      )}
      {pattern === 'figure-eight' && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Radius X" value={movement.radiusX} onChange={(value) => onChange('movement.radiusX', value)} />
          <NumberField label="Radius Y" value={movement.radiusY} onChange={(value) => onChange('movement.radiusY', value)} />
          <NumberField label="Speed" value={movement.speed} onChange={(value) => onChange('movement.speed', value)} />
        </div>
      )}
      {pattern === 'irregular' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Scale" value={movement.scale} onChange={(value) => onChange('movement.scale', value)} />
          <NumberField label="Speed" value={movement.speed} onChange={(value) => onChange('movement.speed', value)} />
        </div>
      )}
    </div>
  );
}
