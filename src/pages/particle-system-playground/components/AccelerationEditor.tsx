import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { CircularForceGizmo } from './CircularForceGizmo';
import { DampingRangeEditor } from './DampingRangeEditor';
import { LinearAccelPlane } from './LinearAccelPlane';
import { RangePairField } from './RangePairField';

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function AccelerationEditor({ system, onChange }: Props) {
  return (
    <section className="grid gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acceleration And Damping</h3>

      <Tabs defaultValue="linear" className="gap-3">
        <TabsList className="grid h-8 w-full grid-cols-4 rounded-md">
          <TabsTrigger value="linear" className="text-xs">Linear</TabsTrigger>
          <TabsTrigger value="radial" className="text-xs">Radial</TabsTrigger>
          <TabsTrigger value="damping" className="text-xs">Damping</TabsTrigger>
          <TabsTrigger value="raw" className="text-xs">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="linear" className="mt-0">
          <LinearAccelPlane system={system} onChange={onChange} />
        </TabsContent>

        <TabsContent value="radial" className="mt-0">
          <CircularForceGizmo system={system} onChange={onChange} />
        </TabsContent>

        <TabsContent value="damping" className="mt-0">
          <DampingRangeEditor system={system} onChange={onChange} />
        </TabsContent>

        <TabsContent value="raw" className="mt-0">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <RangePairField label="Linear X" minKey="linearAccelXMin" maxKey="linearAccelXMax" system={system} onChange={onChange} step={1} />
            <RangePairField label="Linear Y" minKey="linearAccelYMin" maxKey="linearAccelYMax" system={system} onChange={onChange} step={1} />
            <RangePairField label="Radial" minKey="radialAccelMin" maxKey="radialAccelMax" system={system} onChange={onChange} step={1} />
            <RangePairField label="Tangential" minKey="tangentialAccelMin" maxKey="tangentialAccelMax" system={system} onChange={onChange} step={1} />
            <RangePairField label="Damping" minKey="linearDampingMin" maxKey="linearDampingMax" system={system} onChange={onChange} step={0.01} />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
