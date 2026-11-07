import { fail } from '../lib/command.js';
import {
  DESKTOP_BRIDGE_SECTIONS,
  DesktopBridgeClient,
  getSnapshotSection,
  isRecord,
  resolveDesktopBridgeOptions,
  resolveSessionId,
  sessionReplayStatePayload,
  tailLogs,
  type DesktopBridgeOptions,
} from '../lib/desktop-bridge.js';
import { printJson, printLine, printMuted, printTable, style } from '../lib/output.js';

export type LiveBridgeCommandOptions = DesktopBridgeOptions & {
  json?: boolean;
};

export type SessionStatusOptions = LiveBridgeCommandOptions & {
  section?: string;
};

export type LogsExportOptions = LiveBridgeCommandOptions & {
  limit?: number;
};

export type ReplayListOptions = LiveBridgeCommandOptions & {
  refresh?: boolean;
  timeoutMs?: number;
};

export async function sessionStatusCommand(sessionId: string | undefined, opts: SessionStatusOptions = {}): Promise<void> {
  const { bridge, desktopUrl } = createBridge(opts);
  const section = normalizeSection(opts.section);

  if (!sessionId && !section) {
    const sessions = (await bridge.listSessions()).sessions ?? [];
    const result = {
      desktopUrl,
      count: sessions.length,
      sessions,
    };
    if (opts.json) {
      printJson(result);
    } else {
      printSessionList(result.sessions);
    }
    return;
  }

  const id = await resolveSessionId(bridge, sessionId);
  const snapshot = await bridge.getSession(id);
  const result = section
    ? { desktopUrl, sessionId: id, section, data: getSnapshotSection(snapshot, section) }
    : { desktopUrl, sessionId: id, snapshot };

  if (opts.json) {
    printJson(result);
  } else {
    printSessionStatus(id, section ? result.data : snapshot);
  }
}

export async function logsExportCommand(sessionId: string | undefined, opts: LogsExportOptions = {}): Promise<void> {
  const { bridge, desktopUrl } = createBridge(opts);
  const id = await resolveSessionId(bridge, sessionId);
  const snapshot = await bridge.getSession(id);
  const logs = tailLogs(snapshot, validatePositiveInt(opts.limit, 500, '--limit'));
  const result = {
    desktopUrl,
    sessionId: id,
    count: logs.length,
    logs,
  };

  if (opts.json) {
    printJson(result);
  } else {
    printLogs(result.logs);
  }
}

export async function replayListCommand(sessionId: string | undefined, opts: ReplayListOptions = {}): Promise<void> {
  const { bridge, desktopUrl } = createBridge(opts);
  const id = await resolveSessionId(bridge, sessionId);
  const timeoutMs = opts.timeoutMs === undefined ? undefined : validatePositiveInt(opts.timeoutMs, 5000, '--timeout-ms');
  const response = opts.refresh
    ? await bridge.sendCommand(id, {
      message: { type: 'cmd:session_replay:list', data: {} },
      waitFor: { type: 'session_replay:list', timeoutMs },
    })
    : null;
  const snapshot = await bridge.getSession(id);
  const state = sessionReplayStatePayload(id, snapshot);
  const list = replayListFromResponse(response) ?? (isRecord(state.list) ? state.list : null);
  const replays = Array.isArray(list?.replays) ? list.replays : [];
  const result = {
    desktopUrl,
    sessionId: id,
    refreshed: opts.refresh === true,
    status: state.status,
    recording: state.recording,
    selectedId: typeof list?.selectedId === 'string' ? list.selectedId : state.selectedId,
    replayCount: replays.length,
    replays,
    list,
  };

  if (opts.json) {
    printJson(result);
  } else {
    printReplayList(result.replays);
  }
}

function createBridge(options: LiveBridgeCommandOptions): { bridge: DesktopBridgeClient; desktopUrl: string } {
  const resolved = resolveDesktopBridgeOptions(options);
  if (!resolved.token) {
    fail('Desktop bridge token is required', {
      details: [
        'Enable Settings -> Security -> MCP Access in the Feather desktop app, pass --token, or set FEATHER_MCP_TOKEN.',
        'These commands use the local desktop bridge directly; they do not start or require an MCP server.',
      ],
    });
  }
  return {
    bridge: new DesktopBridgeClient(resolved.desktopUrl, resolved.token),
    desktopUrl: resolved.desktopUrl,
  };
}

function normalizeSection(section: string | undefined): string | undefined {
  if (!section) return undefined;
  if (DESKTOP_BRIDGE_SECTIONS.includes(section as typeof DESKTOP_BRIDGE_SECTIONS[number])) return section;
  fail(`Unknown session section: ${section}`, {
    details: [`Expected one of: ${DESKTOP_BRIDGE_SECTIONS.join(', ')}.`],
  });
}

function validatePositiveInt(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const next = Number(value);
  if (!Number.isFinite(next) || next < 1) {
    fail(`${label} must be a positive integer.`);
  }
  return Math.floor(next);
}

function replayListFromResponse(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) return null;
  if (isRecord(response.data)) return response.data;
  if (isRecord(response.response)) return replayListFromResponse(response.response);
  if (isRecord(response.result)) return replayListFromResponse(response.result);
  return null;
}

function printSessionList(sessions: Array<Record<string, unknown>>): void {
  printLine(style.heading(`Feather sessions (${sessions.length})`));
  if (!sessions.length) {
    printMuted('  No connected sessions.');
    return;
  }
  printTable({
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'connected', label: 'Connected' },
    ],
    rows: sessions.map((session) => ({
      id: String(session.id ?? ''),
      name: String(session.name ?? session.sessionName ?? ''),
      connected: session.connected === false ? 'no' : 'yes',
    })),
  });
}

function printSessionStatus(sessionId: string, value: unknown): void {
  printLine(style.heading(`Feather session ${sessionId}`));
  if (!isRecord(value)) {
    printMuted(`  ${String(value ?? 'No session data.')}`);
    return;
  }
  const logs = Array.isArray(value.logs) ? value.logs.length : undefined;
  const plugins = isRecord(value.plugins) ? Object.keys(value.plugins).length : undefined;
  const connected = value.connected === false ? 'no' : 'yes';
  printTable({
    columns: [
      { key: 'key', label: 'Field' },
      { key: 'value', label: 'Value' },
    ],
    rows: [
      { key: 'connected', value: connected },
      { key: 'logs', value: logs === undefined ? '' : String(logs) },
      { key: 'plugins', value: plugins === undefined ? '' : String(plugins) },
    ].filter((row) => row.value !== ''),
  });
}

function printLogs(logs: unknown[]): void {
  printLine(style.heading(`Feather logs (${logs.length})`));
  if (!logs.length) {
    printMuted('  No logs captured in the current session snapshot.');
    return;
  }
  for (const entry of logs) {
    if (isRecord(entry)) {
      const level = typeof entry.level === 'string' ? entry.level : 'log';
      const message = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry);
      printLine(`  [${level}] ${message}`);
    } else {
      printLine(`  ${String(entry)}`);
    }
  }
}

function printReplayList(replays: unknown[]): void {
  printLine(style.heading(`Session replays (${replays.length})`));
  if (!replays.length) {
    printMuted('  No replays reported by the current session snapshot.');
    return;
  }
  printTable({
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'status', label: 'Status' },
      { key: 'duration', label: 'Duration' },
      { key: 'inputs', label: 'Inputs' },
    ],
    rows: replays.map((entry) => {
      const replay = isRecord(entry) ? entry : {};
      return {
        id: String(replay.id ?? ''),
        status: String(replay.status ?? ''),
        duration: replay.duration === undefined ? '' : String(replay.duration),
        inputs: replay.inputCount === undefined ? '' : String(replay.inputCount),
      };
    }),
  });
}
