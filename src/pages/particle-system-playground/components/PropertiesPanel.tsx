import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  BLEND_MODES,
  EMISSION_AREA_DISTRIBUTIONS,
  type ParticleSystemPlaygroundSystem,
} from '@/types/particle-system-playground';
import { AccelerationEditor } from './AccelerationEditor';
import { ColorGradientEditor } from './ColorGradientEditor';
import { DirectionSpreadGizmo } from './DirectionSpreadGizmo';
import { MotionPresets } from './MotionPresets';
import { RangePairField } from './RangePairField';
import { RotationSpinGizmo } from './RotationSpinGizmo';
import { SizeCurveEditor } from './SizeCurveEditor';
import { TextureOffsetGizmo } from './TextureOffsetGizmo';

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

type NumberFieldDef = {
  type?: 'number';
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
};

type RangeFieldDef = {
  type: 'range';
  minKey: string;
  maxKey: string;
  label: string;
  step?: number;
};

type FieldDef = NumberFieldDef | RangeFieldDef;

const groups: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: 'Emission',
    fields: [
      { key: 'emissionRate', label: 'Rate', min: 0, step: 1 },
      { key: 'emitterLifetime', label: 'Emitter Lifetime', min: -1, step: 0.1 },
      {
        type: 'range',
        minKey: 'particleLifetimeMin',
        maxKey: 'particleLifetimeMax',
        label: 'Particle Life',
        step: 0.01,
      },
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
      { type: 'range', minKey: 'speedMin', maxKey: 'speedMax', label: 'Speed', step: 1 },
    ],
  },
  {
    title: 'Shape',
    fields: [
      { key: 'sizeVariation', label: 'Size Variation', min: 0, max: 1, step: 0.01 },
      { key: 'offsetX', label: 'Texture Offset X', step: 1 },
      { key: 'offsetY', label: 'Texture Offset Y', step: 1 },
    ],
  },
  {
    title: 'Rotation',
    fields: [
      { type: 'range', minKey: 'rotationMin', maxKey: 'rotationMax', label: 'Rotation', step: 0.01 },
      { type: 'range', minKey: 'spinMin', maxKey: 'spinMax', label: 'Spin', step: 0.01 },
      { key: 'spinVariation', label: 'Spin Variation', min: 0, max: 1, step: 0.01 },
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

function valueFor(system: ParticleSystemPlaygroundSystem, key: string): string | number | boolean {
  if (key === 'emitterOffsetX') return system.x;
  if (key === 'emitterOffsetY') return system.y;
  if (key === 'kickStartSteps') return system.kickStartSteps;
  if (key === 'kickStartDt') return system.kickStartDt;
  if (key === 'emitAtStart') return system.emitAtStart;
  return system.properties[key as keyof typeof system.properties] ?? '';
}

function NumberField({
  field,
  system,
  onChange,
}: {
  field: NumberFieldDef;
  system: ParticleSystemPlaygroundSystem;
  onChange: Props['onChange'];
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground font-semibold">{field.label}</Label>
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
        <div className="grid grid-cols-[1fr_10rem_7rem_9rem] gap-2">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground font-semibold">Title</Label>
            <Input
              className="h-8 text-xs"
              value={system.title}
              onChange={(event) => onChange('title', event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground font-semibold">Blend</Label>
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
              id={`emitter-enabled-${system.index}`}
              checked={system.enabled}
              onCheckedChange={(checked) => onChange('enabled', checked === true)}
            />
            <Label htmlFor={`emitter-enabled-${system.index}`} className="text-xs">
              Enabled
            </Label>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox
              id={`relative-rotation-${system.index}`}
              checked={!!system.properties.relativeRotation}
              onCheckedChange={(checked) => onChange('relativeRotation', checked === true)}
            />
            <Label htmlFor={`relative-rotation-${system.index}`} className="text-xs">
              Relative rotation
            </Label>
          </div>
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground font-semibold">Sizes</Label>
          <SizeCurveEditor
            value={system.properties.sizes ?? '1'}
            variation={system.properties.sizeVariation ?? 0}
            onChange={(v) => onChange('sizes', v)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground font-semibold">Color Gradient</Label>
          <ColorGradientEditor
            value={system.properties.colors ?? '1, 1, 1, 1'}
            onChange={(value) => onChange('colors', value)}
          />
        </div>
      </div>

      <MotionPresets system={system} onChange={onChange} />

      {groups.map((group) => (
        <section key={group.title} className="grid gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <Separator className="flex-1" />
          </div>
          {group.title === 'Direction And Speed' && <DirectionSpreadGizmo system={system} onChange={onChange} />}
          {group.title === 'Shape' && <TextureOffsetGizmo system={system} onChange={onChange} />}
          {group.title === 'Rotation' && <RotationSpinGizmo system={system} onChange={onChange} />}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {group.fields.map((field) =>
              field.type === 'range' ? (
                <RangePairField
                  key={field.label}
                  label={field.label}
                  minKey={field.minKey}
                  maxKey={field.maxKey}
                  system={system}
                  onChange={onChange}
                  step={field.step}
                />
              ) : (
                <NumberField key={field.key} field={field} system={system} onChange={onChange} />
              ),
            )}
          </div>
        </section>
      ))}

      <AccelerationEditor system={system} onChange={onChange} />

      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emission Area</h3>
          <Separator className="flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground font-semibold">Distribution</Label>
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
