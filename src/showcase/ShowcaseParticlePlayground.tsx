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
    <ParticleSystemPlaygroundPage
      playgroundOverride={playground}
      standalone
      preview={
        <LoveJsPreview
          title="Particle Preview"
          description="The standalone build posts local particle settings into this isolated preview frame."
          payload={payload}
        />
      }
    />
  );
}
