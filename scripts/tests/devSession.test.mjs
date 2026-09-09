import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  commandHasMarkers,
  createDevSessionTracker,
  devSessionPath,
  readDevSessionEntries,
  readProcessCommand,
  validateDevSession,
} from '../dev-session.mjs';

function withTemporaryRoot(run) {
  const root = mkdtempSync(join(tmpdir(), 'feather-dev-session-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('tracks every owned process and removes the session when it becomes empty', () => {
  withTemporaryRoot((root) => {
    const tracker = createDevSessionTracker(root, { ownerPid: 41001 });
    tracker.addChild({ tag: 'Inspector', pid: 41002, markers: ['inspector:tauri'] });
    tracker.addChild({ tag: 'Game', pid: 41003, markers: ['apps/cli/dist/index.js', ' run '] });

    const path = devSessionPath(root, 41001);
    assert.equal(existsSync(path), true);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).children, [
      { tag: 'Inspector', pid: 41002, markers: ['inspector:tauri'] },
      { tag: 'Game', pid: 41003, markers: ['apps/cli/dist/index.js', ' run '] },
    ]);

    tracker.removeChild(41002);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).children, [
      { tag: 'Game', pid: 41003, markers: ['apps/cli/dist/index.js', ' run '] },
    ]);

    tracker.removeChild(41003);
    assert.equal(existsSync(path), false);
  });
});

test('keeps concurrent up sessions in separate records', () => {
  withTemporaryRoot((root) => {
    const first = createDevSessionTracker(root, { ownerPid: 42001 });
    const second = createDevSessionTracker(root, { ownerPid: 42002 });

    first.addChild({ tag: 'Inspector', pid: 42003, markers: ['inspector:tauri'] });
    second.addChild({ tag: 'Game', pid: 42004, markers: ['apps/cli/dist/index.js'] });

    const entries = readDevSessionEntries(root);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((entry) => entry.session.ownerPid), [42001, 42002]);

    first.close();
    second.close();
  });
});

test('rejects malformed, foreign-root, and markerless session data', () => {
  withTemporaryRoot((root) => {
    const base = {
      version: 1,
      root,
      ownerPid: 43001,
      startedAt: new Date().toISOString(),
      children: [{ tag: 'Inspector', pid: 43002, markers: ['inspector:tauri'] }],
    };

    assert.ok(validateDevSession(base, root));
    assert.equal(validateDevSession({ ...base, root: `${root}-other` }, root), null);
    assert.equal(validateDevSession({ ...base, root: undefined }, root), null);
    assert.equal(
      validateDevSession({ ...base, children: [{ tag: 'Inspector', pid: 43002 }] }, root),
      null,
    );
  });
});

test('requires every command marker before a PID can be treated as owned', () => {
  const command = 'node apps/cli/dist/index.js run examples/flappybird';
  assert.equal(commandHasMarkers(command, ['apps/cli/dist/index.js', ' run ']), true);
  assert.equal(commandHasMarkers(command, ['apps/cli/dist/index.js', 'studio:tauri']), false);
  assert.equal(commandHasMarkers(command, []), false);
});

test('reads process commands through platform-specific commands', () => {
  const calls = [];
  const fakeSpawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: 'node scripts/dev-up.mjs\n' };
  };

  assert.equal(
    readProcessCommand(44001, { platform: 'darwin', spawnSync: fakeSpawnSync }),
    'node scripts/dev-up.mjs',
  );
  assert.deepEqual(calls[0].args, ['-p', '44001', '-o', 'command=']);

  assert.equal(
    readProcessCommand(44002, { platform: 'win32', spawnSync: fakeSpawnSync }),
    'node scripts/dev-up.mjs',
  );
  assert.equal(calls[1].command, 'powershell.exe');
  assert.match(calls[1].args.at(-1), /ProcessId = 44002/);
});
