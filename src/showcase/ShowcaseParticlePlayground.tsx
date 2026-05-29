import ParticleSystemPlaygroundPage from '@/pages/particle-system-playground';
import { useLocalParticlePlayground } from './use-local-particle-playground';

export function ShowcaseParticlePlayground() {
  const playground = useLocalParticlePlayground();

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <ParticleSystemPlaygroundPage playgroundOverride={playground} standalone />
    </div>
  );
}
