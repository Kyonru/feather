import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { useState } from 'react';
import { CircularForceGizmo } from './CircularForceGizmo';
import { DampingRangeEditor } from './DampingRangeEditor';
import { LinearAccelPlane } from './LinearAccelPlane';
import { RangePairField } from './RangePairField';

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function AccelerationEditor({ system, onChange }: Props) {
  const [mode, setMode] = useState<'visual' | 'raw'>('visual');

  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acceleration And Damping</h3>
        <Separator className="flex-1" />
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as 'visual' | 'raw')}
          className="h-6"
        >
          <ToggleGroupItem value="visual" className="h-6 px-2 text-[10px]">Visual</ToggleGroupItem>
          <ToggleGroupItem value="raw" className="h-6 px-2 text-[10px]">Raw</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === 'visual' ? (
        <div className="grid gap-4">
          <LinearAccelPlane system={system} onChange={onChange} />
          <CircularForceGizmo system={system} onChange={onChange} />
          <DampingRangeEditor system={system} onChange={onChange} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <RangePairField label="Linear X" minKey="linearAccelXMin" maxKey="linearAccelXMax" system={system} onChange={onChange} step={1} />
          <RangePairField label="Linear Y" minKey="linearAccelYMin" maxKey="linearAccelYMax" system={system} onChange={onChange} step={1} />
          <RangePairField label="Radial" minKey="radialAccelMin" maxKey="radialAccelMax" system={system} onChange={onChange} step={1} />
          <RangePairField label="Tangential" minKey="tangentialAccelMin" maxKey="tangentialAccelMax" system={system} onChange={onChange} step={1} />
          <RangePairField label="Damping" minKey="linearDampingMin" maxKey="linearDampingMax" system={system} onChange={onChange} step={0.01} />
        </div>
      )}
    </section>
  );
}
