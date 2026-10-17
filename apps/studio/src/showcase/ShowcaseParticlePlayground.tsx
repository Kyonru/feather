import ParticleSystemPlaygroundPage from '@studio/tools/particle-system-playground';

/**
 * The showcase used to hand this component its own local controller and a
 * `standalone` prop, because with no game attached the tool would otherwise pick
 * the live controller and report itself unavailable. Both were workarounds for
 * the session model being inverted; the tool defaults to local now, so the
 * showcase mounts it the same way Studio does — which is the point of the
 * showcase being a faithful preview.
 */
export function ShowcaseParticlePlayground() {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <ParticleSystemPlaygroundPage />
    </div>
  );
}
