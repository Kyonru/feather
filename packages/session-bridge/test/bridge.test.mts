import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRIDGE_MAX_REQUEST_BYTES,
  BRIDGE_MIN_SUPPORTED,
  BRIDGE_VERSION,
  PREVIEW_ALLOWLIST,
  isAllowedPreview,
  negotiate,
  normalizeSessionList,
  sortSessions,
} from '../src/contract.ts';
import { createBridgeServer, createClientBridge, createNullBridge } from '../src/adapters.ts';
import type { BridgeRequest, BridgeResponse, BridgeSessionSummary } from '../src/contract.ts';

// --- helpers ---------------------------------------------------------------

type Delivered = { sessionId: string; message: Record<string, unknown> };

function makeServer(options: { sessions?: BridgeSessionSummary[]; now?: () => number; ttlMs?: number } = {}) {
  const delivered: Delivered[] = [];
  let sessions: BridgeSessionSummary[] = options.sessions ?? [{ id: 's1', name: 'Demo', connectedAt: 1_000 }];
  let token = 0;
  let request = 0;

  const server = createBridgeServer({
    serverVersion: '4.0.0',
    listSessions: () => sessions,
    deliver: async (sessionId, message) => {
      delivered.push({ sessionId, message });
    },
    exportPreferences: () => ({ version: 1, particleTimelineZoom: 2 }),
    now: options.now,
    ttlMs: options.ttlMs,
    mintToken: () => `cap-${++token}`,
    mintRequestId: () => `req-${++request}`,
  });

  return {
    server,
    handle: server.handle,
    delivered,
    setSessions: (next: BridgeSessionSummary[]) => {
      sessions = next;
    },
  };
}

function clientFor(handle: (r: BridgeRequest) => Promise<BridgeResponse>, instance = 'studio-a') {
  return createClientBridge((request) => handle(request), { clientVersion: '1.0.0', clientInstanceId: instance });
}

async function pairedClient(fixture: ReturnType<typeof makeServer>, instance?: string) {
  const client = clientFor(fixture.handle, instance);
  const connected = await client.connect();
  assert.equal(connected.ok, true, 'handshake succeeds');
  return client;
}

async function selectedClient(fixture: ReturnType<typeof makeServer>, sessionId = 's1') {
  const client = await pairedClient(fixture);
  const selected = await client.selectSession(sessionId);
  assert.equal(selected.ok, true, 'selection succeeds');
  return client;
}

/** Talk to the server directly, bypassing the client's own guards. */
async function raw(fixture: ReturnType<typeof makeServer>, request: unknown) {
  return fixture.handle(request);
}

const preview = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  plugin: 'shader-graph',
  action: 'preview-shader',
  params: { pixelSource: 'vec4 effect() { return vec4(1.0); }' },
  ...overrides,
});

// --- version negotiation ---------------------------------------------------

test('negotiate accepts an overlapping range', () => {
  const result = negotiate({ version: 3, minSupported: 1 }, { version: 2, minSupported: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.version, 2, 'settles on the lower shared version');
});

test('negotiate rejects a peer that is too old', () => {
  const result = negotiate({ version: 3, minSupported: 3 }, { version: 1, minSupported: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, 'incompatible-version');
});

test('negotiate rejects a peer that is too new to accept us', () => {
  const result = negotiate({ version: 1, minSupported: 1 }, { version: 5, minSupported: 4 });
  assert.equal(result.ok, false);
});

test('a v1 Studio — the one with the generic send — is refused at handshake', async () => {
  // v2 exists to close session.send. Accepting a peer that still speaks it
  // would reopen that surface for anyone who kept an old build around.
  assert.ok(BRIDGE_MIN_SUPPORTED >= 2);
  const fixture = makeServer();
  const response = await raw(fixture, {
    id: 'h',
    bridgeVersion: 1,
    method: 'handshake',
    params: { client: 'studio', clientVersion: '0.1.0', clientInstanceId: 'old', bridgeVersion: 1, minSupported: 1 },
  });
  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'incompatible-version');
  assert.match(response.ok === false ? response.error.message : '', /Update the older application/);
});

// --- authentication and expiry ---------------------------------------------

test('commands are refused before a handshake', async () => {
  const fixture = makeServer();
  const client = clientFor(fixture.handle);

  const result = await client.sendPreview(preview());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'not-handshaken');
  assert.equal(fixture.delivered.length, 0, 'nothing reached the game');
});

test('a handshake returns a scoped grant, not just a token', async () => {
  const fixture = makeServer();
  const client = clientFor(fixture.handle);
  const grant = await client.connect();

  assert.equal(grant.ok, true);
  if (!grant.ok) return;
  assert.equal(grant.value.bridgeVersion, BRIDGE_VERSION);
  assert.equal(grant.value.sessionId, null, 'no session is chosen on the user’s behalf');
  assert.ok(!grant.value.methods.includes('handshake'));
  assert.deepEqual(
    [...grant.value.methods].sort(),
    ['capability.release', 'preferences.export', 'preview.cancel', 'preview.send', 'sessions.list', 'sessions.select'],
  );
  assert.deepEqual(grant.value.plugins, PREVIEW_ALLOWLIST);
});

test('a forged capability is rejected', async () => {
  const fixture = makeServer();
  const response = await raw(fixture, {
    id: 'x',
    bridgeVersion: BRIDGE_VERSION,
    method: 'preview.send',
    capability: 'not-a-real-capability',
    params: preview(),
  });

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'unauthenticated');
  assert.equal(fixture.delivered.length, 0);
});

test('a capability expires on the server as well as in the client', async () => {
  let clock = 0;
  const fixture = makeServer({ now: () => clock, ttlMs: 1_000 });
  const handshake = await raw(fixture, {
    id: 'h',
    bridgeVersion: BRIDGE_VERSION,
    method: 'handshake',
    params: { client: 'studio', clientVersion: '1.0.0', clientInstanceId: 'a', bridgeVersion: 2, minSupported: 2 },
  });
  assert.equal(handshake.ok, true);
  const capability = handshake.ok ? (handshake.result as { capability: string }).capability : '';

  clock = 999;
  const before = await raw(fixture, { id: '1', bridgeVersion: 2, method: 'sessions.list', capability, params: {} });
  assert.equal(before.ok, true, 'valid until expiry');

  clock = 1_000;
  const after = await raw(fixture, { id: '2', bridgeVersion: 2, method: 'sessions.list', capability, params: {} });
  assert.equal(after.ok, false);
  assert.equal(after.ok === false && after.error.code, 'unauthenticated');
  assert.equal(fixture.server.pairings().length, 0, 'an expired pairing is not listed');
});

test('an expired capability is refused by the client without a round trip', async () => {
  let reached = 0;
  let clock = 10_000;
  const client = createClientBridge(
    async (request) => {
      reached += 1;
      return {
        id: request.id,
        bridgeVersion: BRIDGE_VERSION,
        ok: true,
        result: { capability: 'cap', expiresAt: 10_500, grant: {} },
      };
    },
    { clientVersion: '1.0.0', clientInstanceId: 'a', now: () => clock },
  );
  await client.connect();
  assert.equal(client.isConnected(), true);
  clock = 10_500;
  assert.equal(client.isConnected(), false, 'an expired capability is not a connection');
  const result = await client.sendPreview(preview());
  assert.equal(result.ok, false);
  assert.equal(reached, 1, 'only the handshake went out');
});

// --- revocation --------------------------------------------------------------

test('revoking one pairing leaves the others working', async () => {
  const fixture = makeServer();
  const first = await pairedClient(fixture, 'studio-a');
  const second = await pairedClient(fixture, 'studio-b');
  const pairings = fixture.server.pairings();
  assert.equal(pairings.length, 2);

  const target = pairings.find((pairing) => pairing.clientInstanceId === 'studio-a');
  assert.ok(target);
  assert.equal(fixture.server.revoke(target.pairingId), true);

  const revoked = await first.listSessions();
  assert.equal(revoked.ok, false);
  assert.equal(revoked.ok === false && revoked.code, 'unauthenticated');
  assert.equal((await second.listSessions()).ok, true, 'the unrelated pairing is untouched');
});

test('a re-handshake from the same Studio replaces its earlier capability', async () => {
  const fixture = makeServer();
  await pairedClient(fixture, 'studio-a');
  await pairedClient(fixture, 'studio-a');
  assert.equal(fixture.server.pairings().length, 1, 'tokens do not accumulate per instance');
});

test('releasing a capability ends the pairing', async () => {
  const fixture = makeServer();
  const client = await pairedClient(fixture);
  await client.release();
  assert.equal(client.isConnected(), false);
  assert.equal(fixture.server.pairings().length, 0);
});

// --- method and action scope -------------------------------------------------

test('a bridge capability cannot reach eval, the debugger, Console, hot reload, packages or replay', async () => {
  const fixture = makeServer();
  const client = await selectedClient(fixture);

  // The generic send this bridge used to have, by every spelling of it.
  for (const method of ['session.send', 'session.describe', 'send', 'eval', 'console.eval']) {
    const response = await raw(fixture, {
      id: method,
      bridgeVersion: BRIDGE_VERSION,
      method,
      capability: 'cap-1',
      params: { sessionId: 's1', message: { type: 'cmd:eval', code: 'os.exit()' } },
    });
    assert.equal(response.ok, false, `${method} is not a bridge method`);
    assert.equal(response.ok === false && response.error.code, 'unknown-method');
  }

  // And through the preview method: only the allowlisted plugin actions pass.
  const attempts = [
    { plugin: 'console', action: 'eval' },
    { plugin: 'debugger', action: 'continue' },
    { plugin: 'hot-reload', action: 'reload' },
    { plugin: 'session-replay', action: 'play' },
    { plugin: 'packages', action: 'install' },
    { plugin: 'filesystem', action: 'write' },
    { plugin: 'shader-graph', action: 'eval' },
    { plugin: 'particle-system-playground', action: 'export-zip' },
    { plugin: '__proto__', action: 'constructor' },
  ];
  for (const attempt of attempts) {
    const result = await client.sendPreview(preview(attempt));
    assert.equal(result.ok, false, `${attempt.plugin}:${attempt.action} must be refused`);
    assert.equal(result.ok === false && result.code, 'forbidden');
  }
  assert.equal(fixture.delivered.length, 0, 'nothing outside the allowlist reached the game');
});

test('a preview becomes exactly one allowlisted plugin command with a fresh requestId', async () => {
  const fixture = makeServer();
  const client = await selectedClient(fixture);

  const sent = await client.sendPreview(preview({ params: { pixelSource: 'x', type: 'cmd:eval' } }));
  const cancelled = await client.cancelPreview({ sessionId: 's1', plugin: 'shader-graph', action: 'preview-shader' });
  assert.equal(sent.ok, true);
  assert.equal(cancelled.ok, true);
  assert.notEqual(sent.ok && sent.value.requestId, cancelled.ok && cancelled.value.requestId);

  assert.deepEqual(fixture.delivered, [
    {
      sessionId: 's1',
      message: {
        type: 'cmd:plugin:action',
        plugin: 'shader-graph',
        action: 'preview-shader',
        // A `type` inside params stays inside params: it cannot rename the command.
        params: { pixelSource: 'x', type: 'cmd:eval' },
        requestId: 'req-1',
      },
    },
    {
      sessionId: 's1',
      message: { type: 'cmd:plugin:action:cancel', plugin: 'shader-graph', action: 'preview-shader', requestId: 'req-2' },
    },
  ]);
});

test('every allowlisted action is accepted, and only those', () => {
  for (const [plugin, actions] of Object.entries(PREVIEW_ALLOWLIST)) {
    for (const action of actions) assert.equal(isAllowedPreview(plugin, action), true, `${plugin}:${action}`);
  }
  assert.equal(isAllowedPreview('shader-graph', 'toString'), false);
  assert.equal(isAllowedPreview('hasOwnProperty', 'call'), false);
});

// --- session scope -------------------------------------------------------------

test('sessions are listed in a stable order, never hash-map order', async () => {
  const fixture = makeServer({
    sessions: [
      { id: 'zeta', name: 'Late', connectedAt: 3_000 },
      { id: 'beta', name: 'Tie B', connectedAt: 1_000 },
      { id: 'alpha', name: 'Tie A', connectedAt: 1_000 },
    ],
  });
  const client = await pairedClient(fixture);
  const listed = await client.listSessions();
  assert.equal(listed.ok, true);
  assert.deepEqual(
    listed.ok && listed.value.sessions.map((session) => session.id),
    ['alpha', 'beta', 'zeta'],
  );
  assert.equal(listed.ok && listed.value.selectedSessionId, null);
});

test('with several games and no selection, a preview asks for one instead of guessing', async () => {
  const fixture = makeServer({
    sessions: [
      { id: 's1', name: 'One', connectedAt: 1 },
      { id: 's2', name: 'Two', connectedAt: 2 },
    ],
  });
  const client = await pairedClient(fixture);
  const result = await client.sendPreview(preview());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'selection-required');
  assert.equal(fixture.delivered.length, 0);
});

test('one game is not an excuse to guess either', async () => {
  // The scope is chosen explicitly (Studio does it for the user when there is
  // exactly one), so a restart can never silently retarget a preview.
  const fixture = makeServer();
  const client = await pairedClient(fixture);
  const result = await client.sendPreview(preview());
  assert.equal(result.ok === false && result.code, 'selection-required');
});

test('no game at all is reported as no-session', async () => {
  const fixture = makeServer({ sessions: [] });
  const client = await pairedClient(fixture);
  const result = await client.sendPreview(preview());
  assert.equal(result.ok === false && result.code, 'no-session');
});

test('selecting a session that is not connected is refused', async () => {
  const fixture = makeServer();
  const client = await pairedClient(fixture);
  const result = await client.selectSession('ghost');
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'stale-session');
});

test('a restarted game makes the selection stale rather than silently retargeting', async () => {
  const fixture = makeServer();
  const client = await selectedClient(fixture, 's1');

  // The game restarts: Inspector now has a new session id for it.
  fixture.setSessions([{ id: 's1-restarted', name: 'Demo', connectedAt: 9_000 }]);

  const result = await client.sendPreview(preview());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'stale-session');
  const listed = await client.listSessions();
  assert.equal(listed.ok && listed.value.selectedSessionId, null, 'the stale scope is not reported as current');
  assert.equal(fixture.delivered.length, 0);
});

test('a preview addressed outside the pairing’s session is refused', async () => {
  const fixture = makeServer({
    sessions: [
      { id: 's1', name: 'One', connectedAt: 1 },
      { id: 's2', name: 'Two', connectedAt: 2 },
    ],
  });
  const client = await selectedClient(fixture, 's1');
  const result = await client.sendPreview(preview({ sessionId: 's2' }));
  assert.equal(result.ok === false && result.code, 'forbidden');
  assert.equal(fixture.delivered.length, 0);
});

// --- size and shape --------------------------------------------------------------

test('an oversized request is rejected before it is parsed', async () => {
  const fixture = makeServer();
  const response = await raw(fixture, 'x'.repeat(BRIDGE_MAX_REQUEST_BYTES + 1));
  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'payload-too-large');
});

test('an oversized handshake is rejected before a capability is minted', async () => {
  const fixture = makeServer();
  const response = await raw(
    fixture,
    JSON.stringify({
      id: 'h',
      bridgeVersion: 2,
      method: 'handshake',
      params: {
        client: 'studio',
        clientVersion: '1.0.0',
        clientInstanceId: 'a',
        bridgeVersion: 2,
        minSupported: 2,
        padding: 'x'.repeat(5_000),
      },
    }),
  );
  assert.equal(response.ok === false && response.error.code, 'payload-too-large');
  assert.equal(fixture.server.pairings().length, 0);
});

test('malformed handshakes never mint a capability', async () => {
  const fixture = makeServer();
  const base = { client: 'studio', clientVersion: '1.0.0', clientInstanceId: 'a', bridgeVersion: 2, minSupported: 2 };
  const bad = [
    null,
    [],
    'studio',
    { ...base, client: 'inspector' },
    { ...base, clientVersion: '' },
    { ...base, clientVersion: '<script>' },
    { ...base, clientInstanceId: undefined },
    { ...base, clientInstanceId: 'x'.repeat(200) },
    { ...base, bridgeVersion: '2' },
    { ...base, minSupported: 1.5 },
  ];
  for (const params of bad) {
    const response = await raw(fixture, { id: 'h', bridgeVersion: 2, method: 'handshake', params });
    assert.equal(response.ok, false, JSON.stringify(params));
    assert.equal(response.ok === false && response.error.code, 'malformed');
  }
  assert.equal(fixture.server.pairings().length, 0);
});

test('malformed preview parameters are rejected before forwarding', async () => {
  const fixture = makeServer();
  await selectedClient(fixture);
  const bad = [
    {},
    { plugin: 'shader-graph', action: 'preview-shader', params: {} },
    { sessionId: 's1', action: 'preview-shader', params: {} },
    { sessionId: 's1', plugin: 'shader-graph', params: {} },
    { sessionId: 's1', plugin: 'shader-graph', action: 'preview-shader', params: 'not-an-object' },
    { sessionId: 's1', plugin: 'shader-graph', action: 'preview-shader', params: [1, 2] },
    { sessionId: 's1', plugin: 'x'.repeat(65), action: 'preview-shader', params: {} },
  ];
  for (const params of bad) {
    const response = await raw(fixture, {
      id: 'p',
      bridgeVersion: 2,
      method: 'preview.send',
      capability: 'cap-1',
      params,
    });
    assert.equal(response.ok === false && response.error.code, 'malformed', JSON.stringify(params));
  }
  assert.equal(fixture.delivered.length, 0);
});

test('requests that are not requests are malformed, not crashes', async () => {
  const fixture = makeServer();
  for (const body of ['{', '[]', 'null', '42', JSON.stringify({ method: 'handshake' })]) {
    const response = await raw(fixture, body);
    assert.equal(response.ok === false && response.error.code, 'malformed', body);
  }
});

// --- the null bridge -------------------------------------------------------

test('the null bridge is a usable state, not an error path', async () => {
  const bridge = createNullBridge();

  assert.equal(bridge.isConnected(), false);
  assert.deepEqual(await bridge.listSessions(), { ok: true, value: { sessions: [], selectedSessionId: null } });
  const sent = await bridge.sendPreview(preview());
  assert.equal(sent.ok, false);
  assert.equal(await bridge.exportPreferences(), null);
  await bridge.release();
});

// --- transport failure -----------------------------------------------------

test('a transport that throws surfaces as an error, not a rejection', async () => {
  const client = createClientBridge(
    async () => {
      throw new Error('socket closed');
    },
    { clientVersion: '1.0.0', clientInstanceId: 'a' },
  );

  const connected = await client.connect();
  assert.equal(connected.ok, false);
  assert.equal(connected.ok === false && connected.code, 'transport-failure');
  assert.match(connected.ok === false ? connected.error : '', /socket closed/);
});

test('a session list from Inspector is coerced before Studio renders it', () => {
  const list = normalizeSessionList({
    sessions: [
      { id: 'b', name: 'B', connectedAt: 2 },
      { id: 42, name: 'not an id' },
      null,
      { id: 'a', name: '   ', connectedAt: 'soon' },
    ],
    selectedSessionId: 'gone',
  });
  assert.deepEqual(list, {
    sessions: [
      { id: 'a', name: null, connectedAt: 0 },
      { id: 'b', name: 'B', connectedAt: 2 },
    ],
    selectedSessionId: null,
  });
  assert.deepEqual(normalizeSessionList('garbage'), { sessions: [], selectedSessionId: null });
  assert.deepEqual(sortSessions([]), []);
});

// --- preferences handoff ---------------------------------------------------

test('preferences transfer over the authenticated bridge', async () => {
  const fixture = makeServer();
  const client = clientFor(fixture.handle);

  assert.equal(await client.exportPreferences(), null, 'refused before handshake');
  await client.connect();

  const payload = (await client.exportPreferences()) as { version: number };
  assert.equal(payload.version, 1);
});

test('the handoff still requires a capability', async () => {
  const fixture = makeServer();
  const response = await raw(fixture, {
    id: 'x',
    bridgeVersion: BRIDGE_VERSION,
    method: 'preferences.export',
    params: {},
  });

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'unauthenticated');
});
