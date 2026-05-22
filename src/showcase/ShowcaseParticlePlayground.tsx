import { useMemo } from 'react';
import ParticleSystemPlaygroundPage from '@/pages/particle-system-playground';
import { LoveJsPreview } from './LoveJsPreview';
import { useLocalParticlePlayground } from './use-local-particle-playground';

export function ShowcaseParticlePlayground() {
  const playground = useLocalParticlePlayground();
  const payload = useMemo(
    () => ({
      tool: 'particle-system-playground',
      activeComposite: playground.activeComposite,
      activeSystem: playground.activeSystem,
      composite: playground.composite,
    }),
    [playground.activeComposite, playground.activeSystem, playground.composite],
  );

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <ParticleSystemPlaygroundPage playgroundOverride={playground} standalone />
      <LoveJsPreview
        floating
        title="Particle Preview"
        description="The standalone build posts local particle settings into this isolated preview frame."
        payload={payload}
      />
    </div>
  );
}
