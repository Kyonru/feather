/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTICLE_HISTORY_LIMIT,
  createParticleHistoryState,
  recordParticleHistory,
  redoParticleHistory,
  restoreParticleSnapshotToData,
  snapshotParticleAuthoring,
  undoParticleHistory,
} from '../../src/pages/particle-system-playground/history.ts';

function system(index, title = `Emitter ${index}`) {
  return {
    index,
    title,
    blendMode: 'alpha',
    enabled: true,
    x: 0,
    y: 0,
    kickStartSteps: 0,
    kickStartDt: 1 / 60,
    emitAtStart: 0,
    texturePath: '',
    texturePreset: 'circle',
    textureFilename: 'circle.png',
    shaderPath: '',
    shaderFilename: '',
    shaderSource: '',
    exportReady: true,
    properties: { emissionRate: 100 },
  };
}

function data(overrides = {}) {
  return {
    type: 'particle-system-playground',
    composites: ['Demo'],
    activeComposite: 'Demo',
    activeSystem: 1,
    data: {
      compositeType: 'scratch',
      x: 400,
      y: 300,
      previewEnabled: true,
      movement: { pattern: 'none', radius: 50 },
      systems: [system(1)],
      timeline: {
        duration: 3,
        mode: 'loop',
        loop: true,
        tracks: [{ systemIndex: 1, clips: [{ id: 'clip-1', start: 0, end: 1, emit: 5 }], lanes: {} }],
      },
      timelineState: { time: 1.25, playing: true, scrubVersion: 7 },
      ...overrides,
    },
  };
}

test('particle authoring snapshots exclude playback state', () => {
  const snapshot = snapshotParticleAuthoring(data());
  assert.ok(snapshot);
  assert.equal(snapshot.activeSystem, 1);
  assert.equal(snapshot.data.timelineState, undefined);
  assert.equal(snapshot.data.timeline?.duration, 3);
});

test('particle history undo redo restores current capture', () => {
  const before = snapshotParticleAuthoring(data({ x: 100 }));
  const current = snapshotParticleAuthoring(data({ x: 200 }));
  let history = createParticleHistoryState();
  history = recordParticleHistory(history, before, { groupKey: 'composite:x', coalesce: true, now: 10 });

  const undo = undoParticleHistory(history, current);
  assert.equal(undo.snapshot?.data.x, 100);
  assert.equal(undo.state.undoStack.length, 0);
  assert.equal(undo.state.redoStack.length, 1);

  const redo = redoParticleHistory(undo.state, undo.snapshot);
  assert.equal(redo.snapshot?.data.x, 200);
  assert.equal(redo.state.undoStack.length, 1);
  assert.equal(redo.state.redoStack.length, 0);
});

test('particle history coalesces repeated scalar edits', () => {
  const first = snapshotParticleAuthoring(data({ x: 100 }));
  const second = snapshotParticleAuthoring(data({ x: 120 }));
  let history = createParticleHistoryState();
  history = recordParticleHistory(history, first, { groupKey: 'composite:x', coalesce: true, now: 10 });
  history = recordParticleHistory(history, second, { groupKey: 'composite:x', coalesce: true, now: 200 });
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].snapshot.data.x, 100);
});

test('particle history skips no-op snapshots when undoing and redoing', () => {
  const before = snapshotParticleAuthoring(data({ x: 100 }));
  const current = snapshotParticleAuthoring(data({ x: 200 }));
  let history = createParticleHistoryState();
  history = recordParticleHistory(history, before, { groupKey: 'before', now: 10 });
  history = recordParticleHistory(history, current, { groupKey: 'noop', now: 20 });

  const undo = undoParticleHistory(history, current);
  assert.equal(undo.snapshot?.data.x, 100);
  assert.equal(undo.state.undoStack.length, 0);
  assert.equal(undo.state.redoStack.length, 1);

  const redo = redoParticleHistory(
    {
      ...undo.state,
      redoStack: [...undo.state.redoStack, { snapshot: undo.snapshot, recordedAt: 30 }],
    },
    undo.snapshot,
  );
  assert.equal(redo.snapshot?.data.x, 200);
});

test('particle history clears redo after a new edit and caps undo entries', () => {
  let history = createParticleHistoryState();
  for (let index = 0; index < PARTICLE_HISTORY_LIMIT + 5; index += 1) {
    history = recordParticleHistory(history, snapshotParticleAuthoring(data({ x: index })), {
      groupKey: `edit:${index}`,
      now: index,
    });
  }
  assert.equal(history.undoStack.length, PARTICLE_HISTORY_LIMIT);
  assert.equal(history.undoStack[0].snapshot.data.x, 5);

  const undone = undoParticleHistory(history, snapshotParticleAuthoring(data({ x: 999 })));
  assert.equal(undone.state.redoStack.length, 1);
  const next = recordParticleHistory(undone.state, snapshotParticleAuthoring(data({ x: 500 })), {
    groupKey: 'new-edit',
    now: 2000,
  });
  assert.equal(next.redoStack.length, 0);
});

test('particle history restore keeps composite identity and replaces authoring data', () => {
  const current = data({ x: 100 });
  const snapshot = snapshotParticleAuthoring(data({ x: 240, systems: [system(1, 'Restored')] }));
  const restored = restoreParticleSnapshotToData(current, snapshot);
  assert.equal(restored?.activeComposite, 'Demo');
  assert.equal(restored?.activeSystem, 1);
  assert.equal(restored?.data?.x, 240);
  assert.equal(restored?.data?.systems[0].title, 'Restored');
});
