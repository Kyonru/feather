import { useHost } from '@feather/host';
import { useInspectorBridge } from './useInspectorBridge';

/**
 * Feather Studio's shell.
 *
 * The three creative tools move in during Phase 05c. This stage exists to prove
 * the application boundary: Studio builds, runs, and reaches a game only through
 * the authenticated bridge — it imports no Inspector code, which is enforced by
 * its Vite config having no alias back into `src/`.
 */
export function StudioApp() {
  const host = useHost();
  const inspector = useInspectorBridge();

  return (
    <main className="studio">
      <header className="studio-header">
        <h1>Feather Studio</h1>
        <p className="studio-sub">Shader graph · Texture lab · Particle playground</p>
      </header>

      <section className="studio-panel">
        <h2>Environment</h2>
        <dl>
          <dt>Host</dt>
          <dd>{host.kind === 'tauri' ? 'Desktop application' : 'Browser'}</dd>
          <dt>Inspector</dt>
          <dd>
            {inspector.connected
              ? `Connected — ${inspector.session.connected ? `game "${inspector.session.name}" attached` : 'no game attached'}`
              : 'Not connected'}
          </dd>
        </dl>

        {!inspector.connected && (
          <>
            <button type="button" className="studio-button" onClick={() => void inspector.connect()}>
              Connect to Feather Inspector
            </button>
            <p className="studio-note">
              Optional. Studio works as a local editor without it; connecting lets you push work
              straight into a running game.
            </p>
          </>
        )}

        {inspector.error && <p className="studio-error">{inspector.error}</p>}
      </section>

      <section className="studio-panel">
        <h2>Tools</h2>
        <p className="studio-note">
          The shader graph, texture lab and particle playground move here in Phase 05c. They are
          still served by Feather Inspector until then.
        </p>
      </section>
    </main>
  );
}
