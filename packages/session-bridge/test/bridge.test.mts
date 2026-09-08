import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BRIDGE_VERSION, negotiate } from '../src/contract.ts';
import { createBridgeServer, createClientBridge, createNullBridge } from '../src/adapters.ts';
import type { BridgeRequest, BridgeResponse, SendParams, SessionDescription } from '../src/contract.ts';

// --- helpers ---------------------------------------------------------------

function makeServer(overrides: Partial<Parameters<typeof createBridgeServer>[0]> = {}) {
  const sent: SendParams[] = [];
  let issued = 'cap-1';
  const valid = new Set([issued]);

  const handle = createBridgeServer({
    serverVersion: '4.0.0',
    issueCapability: () => ({ capability: issued, expiresAt: Date.now() + 60_000 }),
    verifyCapability: (c) => valid.has(c),
    describeSession: (): SessionDescription => ({ sessionId: 's1', name: 'Demo', connected: true }),
    send: async (params) => {
      sent.push(params);
    },
    exportPreferences: () => ({ version: 1, particleTimelineZoom: 2 }),
    ...overrides,
  });

  return {
    handle,
    sent,
    revoke: () => valid.clear(),
    rotate: (next: string) => {
      valid.clear();
      valid.add(next);
      issued = next;
    },
  };
}

function connect(handle: (r: BridgeRequest) => Promise<BridgeResponse>) {
  return createClientBridge((request) => handle(request), { clientVersion: '1.0.0' });
}

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

// --- authentication --------------------------------------------------------

test('commands are refused before a handshake', async () => {
  const server = makeServer();
  const client = connect(server.handle);

  const result = await client.send({ sessionId: 's1', message: { type: 'cmd:log' } });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Connect to Feather Inspector first/);
  assert.equal(server.sent.length, 0, 'nothing reached the game');
});

test('a handshake authenticates and unlocks commands', async () => {
  const server = makeServer();
  const client = connect(server.handle);

  assert.equal(client.isConnected(), false);
  const connected = await client.connect();
  assert.equal(connected.ok, true);
  assert.equal(client.isConnected(), true);

  const result = await client.send({ sessionId: 's1', message: { type: 'cmd:log' } });
  assert.equal(result.ok, true);
  assert.equal(server.sent.length, 1);
});

test('a forged capability is rejected', async () => {
  const server = makeServer();
  const forged: BridgeRequest = {
    id: 'x',
    bridgeVersion: BRIDGE_VERSION,
    method: 'session.send',
    capability: 'not-a-real-capability',
    params: { sessionId: 's1', message: {} },
  };

  const response = await server.handle(forged);
  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'unauthenticated');
  assert.equal(server.sent.length, 0);
});

test('a revoked capability stops working immediately', async () => {
  const server = makeServer();
  const client = connect(server.handle);
  await client.connect();
  assert.equal((await client.send({ sessionId: 's1', message: {} })).ok, true);

  server.revoke();

  const after = await client.send({ sessionId: 's1', message: {} });
  assert.equal(after.ok, false);
  assert.match(after.error ?? '', /Missing or expired/);
  assert.equal(server.sent.length, 1, 'the revoked command did not reach the game');
});

test('an expired capability is refused by the client without a round trip', async () => {
  let reached = 0;
  const handle = createBridgeServer({
    serverVersion: '4.0.0',
    // Already expired when issued.
    issueCapability: () => ({ capability: 'cap', expiresAt: Date.now() - 1 }),
    verifyCapability: () => true,
    describeSession: () => ({ sessionId: 's1', name: 'Demo', connected: true }),
    send: async () => {
      reached += 1;
    },
    exportPreferences: () => null,
  });
  const client = connect(handle);
  await client.connect();

  assert.equal(client.isConnected(), false, 'an expired capability is not a connection');
  const result = await client.send({ sessionId: 's1', message: {} });
  assert.equal(result.ok, false);
  assert.equal(reached, 0);
});

// --- incompatible peers ----------------------------------------------------

test('an incompatible client never reaches a command handler', async () => {
  const server = makeServer();
  const response = await server.handle({
    id: 'h',
    bridgeVersion: 99,
    method: 'handshake',
    params: { client: 'studio', clientVersion: '9.0.0', bridgeVersion: 99, minSupported: 99 },
  });

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'incompatible-version');
  assert.match(response.ok === false ? response.error.message : '', /Update the older application/);
});

// --- session state ---------------------------------------------------------

test('sending with no attached game reports no-session rather than failing silently', async () => {
  const server = makeServer({
    describeSession: () => ({ sessionId: null, name: null, connected: false }),
  });
  const client = connect(server.handle);
  await client.connect();

  const result = await client.send({ sessionId: 'anything', message: {} });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /no game attached/);
});

// --- the null bridge -------------------------------------------------------

test('the null bridge is a usable state, not an error path', async () => {
  const bridge = createNullBridge();

  assert.equal(bridge.isConnected(), false);
  assert.deepEqual(await bridge.describeSession(), { sessionId: null, name: null, connected: false });
  assert.equal((await bridge.send({ sessionId: 's', message: {} })).ok, false);
  assert.equal(await bridge.exportPreferences(), null);
});

// --- transport failure -----------------------------------------------------

test('a transport that throws surfaces as an error, not a rejection', async () => {
  const client = createClientBridge(
    async () => {
      throw new Error('socket closed');
    },
    { clientVersion: '1.0.0' },
  );

  const connected = await client.connect();
  assert.equal(connected.ok, false);
  assert.match(connected.error ?? '', /socket closed/);
});

// --- preferences handoff ---------------------------------------------------

test('preferences transfer over the authenticated bridge', async () => {
  const server = makeServer();
  const client = connect(server.handle);

  assert.equal(await client.exportPreferences(), null, 'refused before handshake');
  await client.connect();

  const payload = (await client.exportPreferences()) as { version: number };
  assert.equal(payload.version, 1);
});

// --- the one-time preferences handoff ------------------------------------

test('a preferences payload survives the round trip', async () => {
  const legacy = {
    version: 1,
    textureLabWorkspaceId: 'my-game',
    textureLabSavedRecipes: [{ id: 'r1', name: 'Legacy Noise' }],
    particleTimelineZoom: 2.5,
    particleTimelineSnap: false,
    assetSourceDir: '/legacy/assets',
  };
  const server = makeServer({ exportPreferences: () => legacy });
  const client = connect(server.handle);
  await client.connect();

  const received = (await client.exportPreferences()) as typeof legacy;
  assert.equal(received.textureLabWorkspaceId, 'my-game');
  assert.equal(received.particleTimelineZoom, 2.5);
  assert.equal(received.particleTimelineSnap, false);
  assert.equal(received.textureLabSavedRecipes.length, 1, 'saved recipes are not dropped');
});

test('nothing to hand over is a normal answer, not a failure', async () => {
  // A fresh Inspector install has no legacy slice. Studio must start clean
  // rather than treat this as an error.
  const server = makeServer({ exportPreferences: () => null });
  const client = connect(server.handle);
  await client.connect();

  assert.equal(await client.exportPreferences(), null);
});

test('the handoff still requires a capability', async () => {
  const server = makeServer({ exportPreferences: () => ({ version: 1 }) });
  const response = await server.handle({
    id: 'x',
    bridgeVersion: BRIDGE_VERSION,
    method: 'preferences.export',
    params: {},
  });

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.error.code, 'unauthenticated');
});
