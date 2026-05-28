export type ShaderGraphGamePreviewCommand = {
  type: 'cmd:plugin:action';
  plugin: 'shader-graph';
  action: 'preview-shader' | 'clear-preview';
  params: Record<string, unknown>;
};

export type ShaderGraphGamePreviewParams = Record<string, unknown>;

export type ShaderGraphGamePreviewSender = (
  sessionId: string,
  command: ShaderGraphGamePreviewCommand,
) => Promise<unknown>;

type Waiter = { resolve: () => void; reject: (error: unknown) => void };
type PendingPreview = {
  sessionId: string;
  params: ShaderGraphGamePreviewParams;
  signature: string;
  waiters: Waiter[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
}

export function shaderGraphPreviewSignature(params: ShaderGraphGamePreviewParams): string {
  return stableJson(params);
}

export function createShaderGraphGamePreviewController(
  sender: ShaderGraphGamePreviewSender,
  options: {
    throttleMs?: number;
    now?: () => number;
    setTimer?: (callback: () => void, delay: number) => ReturnType<typeof globalThis.setTimeout>;
    clearTimer?: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
  } = {},
) {
  const throttleMs = options.throttleMs ?? 500;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
  let pending: PendingPreview | null = null;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let lastSentSignature = '';

  function settle(waiters: Waiter[], error?: unknown) {
    for (const waiter of waiters) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }

  async function flushPending() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    const next = pending;
    pending = null;
    if (!next) return;

    if (next.signature === lastSentSignature) {
      settle(next.waiters);
      return;
    }

    try {
      await sender(next.sessionId, {
        type: 'cmd:plugin:action',
        plugin: 'shader-graph',
        action: 'preview-shader',
        params: {
          ...next.params,
          previewKey: next.signature,
        },
      });
      lastSentAt = now();
      lastSentSignature = next.signature;
      settle(next.waiters);
    } catch (error) {
      settle(next.waiters, error);
    }
  }

  function scheduleFlush() {
    if (timer) return;
    const delay = Math.max(0, throttleMs - (now() - lastSentAt));
    timer = setTimer(() => {
      void flushPending();
    }, delay);
  }

  return {
    preview(sessionId: string, params: ShaderGraphGamePreviewParams) {
      const signature = shaderGraphPreviewSignature(params);
      if (!pending && signature === lastSentSignature) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const waiter = { resolve, reject };
        if (pending) {
          pending.sessionId = sessionId;
          pending.params = params;
          pending.signature = signature;
          pending.waiters.push(waiter);
        } else {
          pending = { sessionId, params, signature, waiters: [waiter] };
        }
        scheduleFlush();
      });
    },
    async clear(sessionId: string) {
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      if (pending) {
        settle(pending.waiters);
        pending = null;
      }
      lastSentSignature = '';
      lastSentAt = Number.NEGATIVE_INFINITY;
      await sender(sessionId, {
        type: 'cmd:plugin:action',
        plugin: 'shader-graph',
        action: 'clear-preview',
        params: {},
      });
    },
    reset() {
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      pending = null;
      lastSentAt = Number.NEGATIVE_INFINITY;
      lastSentSignature = '';
    },
  };
}
