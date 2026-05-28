import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShaderGraphGamePreviewController,
  type ShaderGraphGamePreviewCommand,
} from '../../src/pages/shader-graph/gamePreviewControllerCore';

function createHarness() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map<number, { callback: () => void; dueAt: number }>();
  const calls: Array<{ sessionId: string; command: ShaderGraphGamePreviewCommand }> = [];
  const controller = createShaderGraphGamePreviewController(
    async (sessionId, command) => {
      calls.push({ sessionId, command });
    },
    {
      throttleMs: 500,
      now: () => now,
      setTimer: (callback, delay) => {
        const id = nextTimerId++;
        timers.set(id, { callback, dueAt: now + delay });
        return id as unknown as ReturnType<typeof globalThis.setTimeout>;
      },
      clearTimer: (timer) => {
        timers.delete(timer as unknown as number);
      },
    },
  );

  async function advance(ms: number) {
    now += ms;
    const due = [...timers.entries()].filter(([, timer]) => timer.dueAt <= now);
    for (const [id, timer] of due) {
      timers.delete(id);
      timer.callback();
    }
    await Promise.resolve();
    await Promise.resolve();
  }

  return { calls, controller, advance };
}

test('dedupes repeated identical preview payloads', async () => {
  const { calls, controller, advance } = createHarness();
  const first = controller.preview('session-a', { pixelSource: 'a' });
  await advance(0);
  await first;
  await controller.preview('session-a', { pixelSource: 'a' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command.action, 'preview-shader');
});

test('coalesces rapid changes to the latest preview payload', async () => {
  const { calls, controller, advance } = createHarness();
  const first = controller.preview('session-a', { pixelSource: 'a' });
  await advance(0);
  await first;
  const firstCall = calls.length;
  const pendingA = controller.preview('session-a', { pixelSource: 'b' });
  const pendingB = controller.preview('session-a', { pixelSource: 'c' });

  assert.equal(firstCall, 1);
  assert.equal(calls.length, 1);
  await advance(500);
  await Promise.all([pendingA, pendingB]);

  assert.equal(calls.length, 2);
  assert.equal(calls[1].command.params.pixelSource, 'c');
});

test('clear cancels pending preview work and sends clear-preview', async () => {
  const { calls, controller, advance } = createHarness();
  const first = controller.preview('session-a', { pixelSource: 'a' });
  await advance(0);
  await first;
  const pending = controller.preview('session-a', { pixelSource: 'b' });
  await controller.clear('session-a');
  await pending;

  assert.equal(calls.length, 2);
  assert.equal(calls[1].command.action, 'clear-preview');
});
