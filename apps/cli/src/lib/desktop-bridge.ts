import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DESKTOP_BRIDGE_URL = 'http://127.0.0.1:4005';

/**
 * Feather Studio's creative endpoint.
 *
 * There is one Feather MCP server — this client — but the state behind it lives
 * in two applications now. Session, log and debugger traffic belongs to
 * Inspector; shaders, textures and particles belong to Studio, which is a
 * separately installed application with its own process.
 *
 * Routing here rather than splitting the MCP keeps the agent-facing surface as
 * one thing to configure.
 */
export const DEFAULT_STUDIO_BRIDGE_URL = 'http://127.0.0.1:4007';
export const DESKTOP_BRIDGE_SECTIONS = ['config', 'logs', 'performance', 'debugger', 'plugins', 'assets', 'observers', 'session-replay'] as const;

export type DesktopBridgeSection = typeof DESKTOP_BRIDGE_SECTIONS[number];

export type DesktopBridgeOptions = {
  desktopUrl?: string;
  studioUrl?: string;
  token?: string;
  studioToken?: string;
};

export type ResolvedDesktopBridgeOptions = {
  desktopUrl: string;
  studioUrl: string;
  token: string;
  studioToken: string;
};

export type SharedDesktopBridgeConfig = {
  token?: string;
  bridgeUrl?: string;
};

export type BridgeCommandRequest = {
  message: Record<string, unknown>;
  waitFor?: {
    type?: string;
    id?: string;
    plugin?: string;
    action?: string;
    timeoutMs?: number;
  };
};

export type CreativeActionRequest = {
  action: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type SessionSummary = {
  id: string;
  connected?: boolean;
  [key: string]: unknown;
};

export type SessionListResponse = {
  sessions?: SessionSummary[];
};

export class DesktopBridgeClient {
  private readonly studioUrl: string;
  private readonly studioToken: string;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    studio?: { url?: string; token?: string },
  ) {
    this.studioUrl = normalizeBaseUrl(studio?.url || DEFAULT_STUDIO_BRIDGE_URL);
    // Studio mints its own token per launch. When one has not been supplied,
    // creative calls will fail authorization with a message naming Studio,
    // which is more useful than silently returning nothing.
    this.studioToken = studio?.token || process.env.FEATHER_STUDIO_MCP_TOKEN || '';
  }

  async health(): Promise<unknown> {
    return this.request('/health');
  }

  async listSessions(): Promise<SessionListResponse> {
    return this.request<SessionListResponse>('/sessions');
  }

  async getSession(sessionId: string): Promise<unknown> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async getCreative(tool: string): Promise<unknown> {
    return this.creativeRequest(`/creative/${encodeURIComponent(tool)}`);
  }

  async runCreativeAction(tool: string, body: CreativeActionRequest): Promise<unknown> {
    return this.creativeRequest(`/creative/${encodeURIComponent(tool)}/action`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async sendCommand(sessionId: string, body: BridgeCommandRequest): Promise<unknown> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/command`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.send<T>(this.baseUrl, this.token, 'Feather Inspector', path, init);
  }

  /**
   * Creative state lives in Feather Studio, a separate application.
   *
   * Routed rather than proxied through Inspector: Studio is useful — and worth
   * asking about — with no Inspector running at all.
   */
  private async creativeRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.send<T>(this.studioUrl, this.studioToken, 'Feather Studio', path, init);
  }

  private async send<T>(
    baseUrl: string,
    token: string,
    app: string,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      // Naming which application is missing is the whole point: "connection
      // refused on 4007" tells an agent nothing it can act on.
      throw new Error(`${app} is not running. Start it and try again.`);
    }

    const text = await response.text();
    const body = text ? safeJson(text) : null;
    if (!response.ok) {
      const detail = isRecord(body) && typeof body.error === 'string' ? body.error : response.statusText;
      throw new Error(`${app} ${response.status}: ${detail}`);
    }
    return body as T;
  }
}

export function resolveDesktopBridgeOptions(options: DesktopBridgeOptions = {}): ResolvedDesktopBridgeOptions {
  const sharedConfig = readSharedDesktopBridgeConfig();
  return {
    desktopUrl: normalizeBaseUrl(options.desktopUrl || sharedConfig?.bridgeUrl || DEFAULT_DESKTOP_BRIDGE_URL),
    studioUrl: normalizeBaseUrl(options.studioUrl || process.env.FEATHER_STUDIO_MCP_URL || DEFAULT_STUDIO_BRIDGE_URL),
    token: options.token || process.env.FEATHER_MCP_TOKEN || sharedConfig?.token || '',
    studioToken: options.studioToken || process.env.FEATHER_STUDIO_MCP_TOKEN || '',
  };
}

export function readSharedDesktopBridgeConfig(): SharedDesktopBridgeConfig | null {
  const explicit = process.env.FEATHER_MCP_CONFIG;
  const path = explicit || join(homedir(), '.feather', 'mcp.json');
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as SharedDesktopBridgeConfig;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export async function resolveSessionId(bridge: DesktopBridgeClient, sessionId?: string): Promise<string> {
  if (sessionId) return sessionId;
  const sessions = (await bridge.listSessions()).sessions?.filter((session) => session.connected !== false) ?? [];
  if (sessions.length === 1) return sessions[0]!.id;
  if (sessions.length === 0) throw new Error('No connected Feather sessions');
  throw new Error(`Multiple Feather sessions are connected; pass sessionId. Sessions: ${sessions.map((session) => session.id).join(', ')}`);
}

export function getSnapshotSection(snapshot: unknown, section: string): unknown {
  if (!isRecord(snapshot)) return null;
  if (section === 'debugger') {
    return {
      status: snapshot.debuggerStatus,
      paused: snapshot.debuggerPaused,
    };
  }
  if (section === 'session-replay') {
    return {
      status: snapshot.sessionReplay,
      recording: snapshot.sessionReplayRecording,
      list: snapshot.sessionReplayList,
    };
  }
  if (section === 'observers') return snapshot.observers;
  return snapshot[section];
}

export function sessionReplayStatePayload(sessionId: string, snapshot: unknown) {
  const status = isRecord(snapshot) && isRecord(snapshot.sessionReplay) ? snapshot.sessionReplay : null;
  const recording = isRecord(snapshot) && isRecord(snapshot.sessionReplayRecording) ? snapshot.sessionReplayRecording : null;
  const list = isRecord(snapshot) && isRecord(snapshot.sessionReplayList) ? snapshot.sessionReplayList : null;
  const replays = Array.isArray(list?.replays) ? list.replays : [];
  return {
    sessionId,
    status,
    recording,
    list,
    replayCount: replays.length,
    selectedId: typeof list?.selectedId === 'string' ? list.selectedId : null,
  };
}

export function tailLogs(snapshot: unknown, limit?: number): unknown[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.logs)) return [];
  return snapshot.logs.slice(-boundedInt(limit, 50, 500));
}

export function boundedInt(value: unknown, fallback: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 1) return fallback;
  return Math.min(Math.floor(next), max);
}

export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
