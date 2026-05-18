import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BLEND_MODES, EMISSION_AREA_DISTRIBUTIONS, type HotParticlesSystem } from '@/types/hot-particles';
import { ColorGradientEditor } from './ColorGradientEditor';

type Props = {
  system: HotParticlesSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

type Field = {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
};

const groups: Array<{ title: string; fields: Field[] }> = [
  {
    title: 'Emission',
    fields: [
      { key: 'emissionRate', label: 'Rate', min: 0, step: 1 },
      { key: 'emitterLifetime', label: 'Emitter Lifetime', min: -1, step: 0.1 },
      { key: 'particleLifetimeMin', label: 'Particle Life Min', min: 0, step: 0.01 },
      { key: 'particleLifetimeMax', label: 'Particle Life Max', min: 0, step: 0.01 },
      { key: 'emitAtStart', label: 'Emit At Start', min: 0, step: 1 },
      { key: 'kickStartSteps', label: 'Kick Steps', min: 0, step: 1 },
      { key: 'kickStartDt', label: 'Kick Dt', min: 0, step: 0.001 },
    ],
  },
  {
    title: 'Direction And Speed',
    fields: [
      { key: 'direction', label: 'Direction', step: 0.01 },
      { key: 'spread', label: 'Spread', min: 0, step: 0.01 },
      { key: 'speedMin', label: 'Speed Min', step: 1 },
      { key: 'speedMax', label: 'Speed Max', step: 1 },
    ],
  },
  {
    title: 'Acceleration And Damping',
    fields: [
      { key: 'linearAccelXMin', label: 'Linear X Min', step: 1 },
      { key: 'linearAccelYMin', label: 'Linear Y Min', step: 1 },
      { key: 'linearAccelXMax', label: 'Linear X Max', step: 1 },
      { key: 'linearAccelYMax', label: 'Linear Y Max', step: 1 },
      { key: 'radialAccelMin', label: 'Radial Min', step: 1 },
      { key: 'radialAccelMax', label: 'Radial Max', step: 1 },
      { key: 'tangentialAccelMin', label: 'Tangential Min', step: 1 },
      { key: 'tangentialAccelMax', label: 'Tangential Max', step: 1 },
      { key: 'linearDampingMin', label: 'Damping Min', min: 0, step: 0.01 },
      { key: 'linearDampingMax', label: 'Damping Max', min: 0, step: 0.01 },
    ],
  },
  {
    title: 'Rotation And Size',
    fields: [
      { key: 'rotationMin', label: 'Rotation Min', step: 0.01 },
      { key: 'rotationMax', label: 'Rotation Max', step: 0.01 },
      { key: 'spinMin', label: 'Spin Min', step: 0.01 },
      { key: 'spinMax', label: 'Spin Max', step: 0.01 },
      { key: 'spinVariation', label: 'Spin Variation', min: 0, max: 1, step: 0.01 },
      { key: 'sizeVariation', label: 'Size Variation', min: 0, max: 1, step: 0.01 },
      { key: 'offsetX', label: 'Texture Offset X', step: 1 },
      { key: 'offsetY', label: 'Texture Offset Y', step: 1 },
    ],
  },
  {
    title: 'Emitter Offset',
    fields: [
      { key: 'emitterOffsetX', label: 'Emitter X', step: 1 },
      { key: 'emitterOffsetY', label: 'Emitter Y', step: 1 },
    ],
  },
];

function valueFor(system: HotParticlesSystem, key: string): string | number | boolean {
  if (key === 'emitterOffsetX') return system.x;
  if (key === 'emitterOffsetY') return system.y;
  if (key === 'kickStartSteps') return system.kickStartSteps;
  if (key === 'kickStartDt') return system.kickStartDt;
  if (key === 'emitAtStart') return system.emitAtStart;
  return system.properties[key as keyof typeof system.properties] ?? '';
}

function NumberField({ field, system, onChange }: { field: Field; system: HotParticlesSystem; onChange: Props['onChange'] }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
      <Input
        className="h-8 text-xs"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={String(valueFor(system, field.key))}
        onChange={(event) => onChange(field.key, Number(event.target.value))}
      />
    </div>
  );
}

export function PropertiesPanel({ system, onChange }: Props) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_10rem_9rem] gap-2">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Title</Label>
            <Input className="h-8 text-xs" value={system.title} onChange={(event) => onChange('title', event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Blend</Label>
            <Select value={system.blendMode} onValueChange={(value) => onChange('blendMode', value)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox
              id="relative-rotation"
              checked={!!system.properties.relativeRotation}
              onCheckedChange={(checked) => onChange('relativeRotation', checked === true)}
            />
            <Label htmlFor="relative-rotation" className="text-xs">
              Relative rotation
            </Label>
          </div>
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Sizes</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={system.properties.sizes ?? ''}
            onChange={(event) => onChange('sizes', event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Color Gradient</Label>
          <ColorGradientEditor value={system.properties.colors ?? '1, 1, 1, 1'} onChange={(value) => onChange('colors', value)} />
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="grid gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <Separator className="flex-1" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {group.fields.map((field) => (
              <NumberField key={field.key} field={field} system={system} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}

      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emission Area</h3>
          <Separator className="flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Distribution</Label>
            <Select
              value={system.properties.emissionAreaDist ?? 'none'}
              onValueChange={(value) => onChange('emissionAreaDist', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMISSION_AREA_DISTRIBUTIONS.map((dist) => (
                  <SelectItem key={dist} value={dist}>
                    {dist}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {[
            { key: 'emissionAreaDx', label: 'Width' },
            { key: 'emissionAreaDy', label: 'Height' },
            { key: 'emissionAreaAngle', label: 'Angle' },
          ].map((field) => (
            <NumberField key={field.key} field={field} system={system} onChange={onChange} />
          ))}
          <div className="flex items-end gap-2 pb-2">
            <Checkbox
              id="emission-area-relative"
              checked={!!system.properties.emissionAreaRelative}
              onCheckedChange={(checked) => onChange('emissionAreaRelative', checked === true)}
            />
            <Label htmlFor="emission-area-relative" className="text-xs">
              Relative
            </Label>
          </div>
        </div>
      </section>
    </div>
  );
}
