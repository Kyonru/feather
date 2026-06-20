import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { fail } from '../lib/command.js';
import { printErrorLine } from '../lib/output.js';

const DEFAULT_DESKTOP_URL = 'http://127.0.0.1:4005';
const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 4006;
const RESOURCE_SECTIONS = ['config', 'logs', 'performance', 'debugger', 'plugins', 'assets', 'observers'] as const;

type McpTransport = 'stdio' | 'http';

export type McpCommandOptions = {
  transport?: McpTransport;
  host?: string;
  port?: number;
  desktopUrl?: string;
  token?: string;
};

type SharedMcpConfig = {
  token?: string;
  bridgeUrl?: string;
};

type BridgeCommandRequest = {
  message: Record<string, unknown>;
  waitFor?: {
    type?: string;
    id?: string;
    plugin?: string;
    action?: string;
    timeoutMs?: number;
  };
};

type SessionSummary = {
  id: string;
  connected?: boolean;
};

type SessionListResponse = {
  sessions?: SessionSummary[];
};

class DesktopBridgeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async health(): Promise<unknown> {
    return this.request('/health');
  }

  async listSessions(): Promise<SessionListResponse> {
    return this.request<SessionListResponse>('/sessions');
  }

  async getSession(sessionId: string): Promise<unknown> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async sendCommand(sessionId: string, body: BridgeCommandRequest): Promise<unknown> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/command`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? safeJson(text) : null;
    if (!response.ok) {
      const detail = isRecord(body) && typeof body.error === 'string' ? body.error : response.statusText;
      throw new Error(`Desktop bridge ${response.status}: ${detail}`);
    }
    return body as T;
  }
}

export async function mcpCommand(options: McpCommandOptions): Promise<void> {
  const transport = options.transport ?? 'stdio';
  if (transport !== 'stdio' && transport !== 'http') {
    fail('MCP transport must be one of: stdio, http');
  }

  const sharedConfig = readSharedMcpConfig();
  const token = options.token || process.env.FEATHER_MCP_TOKEN || sharedConfig?.token || '';
  const desktopUrl = normalizeBaseUrl(options.desktopUrl || sharedConfig?.bridgeUrl || DEFAULT_DESKTOP_URL);

  if (!token) {
    fail('MCP token is required', {
      details: [
        'Enable MCP Access in Feather Settings → Security, pass --token, or set FEATHER_MCP_TOKEN.',
      ],
    });
  }

  const bridge = new DesktopBridgeClient(desktopUrl, token);
  const server = createFeatherMcpServer(bridge);

  if (transport === 'stdio') {
    await server.connect(new StdioServerTransport());
    return new Promise(() => {});
  }

  await runHttpMcpServer(server, {
    host: options.host ?? DEFAULT_HTTP_HOST,
    port: options.port ?? DEFAULT_HTTP_PORT,
    token,
  });
}

function createFeatherMcpServer(bridge: DesktopBridgeClient): McpServer {
  const server = new McpServer(
    { name: 'feather', version: '3.3.1' },
    {
      instructions:
        'Expose live Feather Love2D debugging sessions. Full-control tools require the local Feather desktop MCP bridge to be enabled and token-authenticated.',
    },
  );

  server.registerResource(
    'feather-sessions',
    'feather://sessions',
    {
      title: 'Feather Sessions',
      description: 'Current Feather session summaries.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri.href, await bridge.listSessions()),
  );

  server.registerResource(
    'feather-session-section',
    new ResourceTemplate('feather://sessions/{sessionId}/{section}', {
      list: async () => {
        const sessions = (await bridge.listSessions()).sessions ?? [];
        return {
          resources: sessions.flatMap((session) =>
            RESOURCE_SECTIONS.map((section) => ({
              name: `feather-${session.id}-${section}`,
              uri: `feather://sessions/${session.id}/${section}`,
              mimeType: 'application/json',
            })),
          ),
        };
      },
    }),
    {
      title: 'Feather Session Section',
      description: 'A single section from a live Feather session snapshot.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const sessionId = String(variables.sessionId ?? '');
      const section = String(variables.section ?? '');
      if (!RESOURCE_SECTIONS.includes(section as typeof RESOURCE_SECTIONS[number])) {
        throw new Error(`Unknown Feather resource section: ${section}`);
      }
      const snapshot = await bridge.getSession(sessionId);
      return jsonResource(uri.href, getSnapshotSection(snapshot, section));
    },
  );

  server.registerTool(
    'feather_list_sessions',
    {
      title: 'List Feather Sessions',
      description: 'List live and recently seen Feather desktop sessions.',
    },
    async () => jsonTool(await bridge.listSessions()),
  );

  server.registerTool(
    'feather_get_session_snapshot',
    {
      title: 'Get Session Snapshot',
      description: 'Get the sanitized live snapshot for a Feather session.',
      inputSchema: { sessionId: z.string().optional() },
    },
    async ({ sessionId }) => jsonTool(await bridge.getSession(await resolveSessionId(bridge, sessionId))),
  );

  server.registerTool(
    'feather_refresh',
    {
      title: 'Refresh Session Data',
      description: 'Ask the game to push a fresh config, performance, observers, assets, or plugin payload.',
      inputSchema: {
        sessionId: z.string().optional(),
        area: z.enum(['config', 'performance', 'observers', 'assets', 'plugins']),
      },
    },
    async ({ sessionId, area }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const typeByArea = {
        config: 'req:config',
        performance: 'req:performance',
        observers: 'req:observers',
        assets: 'req:assets',
        plugins: 'req:plugins',
      } satisfies Record<typeof area, string>;
      return jsonTool(await bridge.sendCommand(id, { message: { type: typeByArea[area] } }));
    },
  );

  server.registerTool(
    'feather_runtime',
    {
      title: 'Control Runtime',
      description: 'Suspend or resume the Feather runtime in a live game.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum(['suspend', 'resume']),
      },
    },
    async ({ sessionId, action }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:runtime', action },
        waitFor: { type: 'runtime:suspended', timeoutMs: 2_000 },
      }));
    },
  );

  server.registerTool(
    'feather_debugger',
    {
      title: 'Control Debugger',
      description: 'Enable, disable, step, continue, inspect frames, or sync debugger settings.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum([
          'enable',
          'disable',
          'continue',
          'step_over',
          'step_into',
          'step_out',
          'set_options',
          'set_breakpoints',
          'set_profiler_probes',
          'inspect_frame',
        ]),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ sessionId, action, data }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const commandType = action.startsWith('set_') || action === 'inspect_frame'
        ? `cmd:debugger:${action}`
        : `cmd:debugger:${action}`;
      return jsonTool(await bridge.sendCommand(id, { message: { type: commandType, data } }));
    },
  );

  server.registerTool(
    'feather_console_eval',
    {
      title: 'Evaluate Lua',
      description: 'Evaluate Lua through the opt-in Console plugin. The desktop bridge supplies the configured API key.',
      inputSchema: {
        sessionId: z.string().optional(),
        code: z.string(),
        readOnly: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, code, readOnly, timeoutMs }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const evalId = `mcp-eval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:eval', code, id: evalId, readOnly: readOnly === true },
        waitFor: { type: 'eval:response', id: evalId, timeoutMs },
      }));
    },
  );

  server.registerTool(
    'feather_console',
    {
      title: 'Console Helpers',
      description: 'Request Console globals/pins, pin/unpin expressions, or inspect a structured console result.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum(['globals', 'pins', 'pin', 'unpin', 'inspect_result']),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ sessionId, action, data }) => {
      const id = await resolveSessionId(bridge, sessionId);
      if (action === 'globals') {
        return jsonTool(await bridge.sendCommand(id, {
          message: { type: 'req:console:globals' },
          waitFor: { type: 'console:globals', timeoutMs: 2_000 },
        }));
      }
      if (action === 'pins') {
        return jsonTool(await bridge.sendCommand(id, {
          message: { type: 'req:console:pins' },
          waitFor: { type: 'console:pins', timeoutMs: 2_000 },
        }));
      }
      const type = action === 'pin'
        ? 'cmd:console:pin'
        : action === 'unpin'
          ? 'cmd:console:unpin'
          : 'cmd:console:inspect_result';
      return jsonTool(await bridge.sendCommand(id, {
        message: { type, data: data ?? {} },
        waitFor: {
          type: action === 'inspect_result' ? 'console:inspect_result' : 'console:pins',
          timeoutMs: 2_000,
        },
      }));
    },
  );

  server.registerTool(
    'feather_plugin_action',
    {
      title: 'Run Plugin Action',
      description: 'Run a Feather plugin action and wait for its action response.',
      inputSchema: {
        sessionId: z.string().optional(),
        plugin: z.string(),
        action: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, plugin, action, params, timeoutMs }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:plugin:action', plugin, action, params: params ?? {} },
        waitFor: { type: 'plugin:action:response', plugin, action, timeoutMs },
      }));
    },
  );

  server.registerTool(
    'feather_plugin_params',
    {
      title: 'Set Plugin Params',
      description: 'Update a Feather plugin parameter payload.',
      inputSchema: {
        sessionId: z.string().optional(),
        plugin: z.string(),
        params: z.record(z.string(), z.unknown()),
      },
    },
    async ({ sessionId, plugin, params }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, { message: { type: 'cmd:plugin:params', plugin, params } }));
    },
  );

  server.registerTool(
    'feather_plugin_set_enabled',
    {
      title: 'Enable Or Disable Plugin',
      description: 'Enable or disable a plugin for the active runtime session.',
      inputSchema: {
        sessionId: z.string().optional(),
        plugin: z.string(),
        enabled: z.boolean(),
      },
    },
    async ({ sessionId, plugin, enabled }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:plugin:set_enabled', plugin, enabled },
        waitFor: plugin === 'console' ? { type: 'console:enabled', timeoutMs: 2_000 } : undefined,
      }));
    },
  );

  server.registerTool(
    'feather_time_travel',
    {
      title: 'Time Travel',
      description: 'Control the Time Travel plugin.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum(['start', 'stop', 'request_frames']),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ sessionId, action, data }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: `cmd:time_travel:${action}`, data },
        waitFor: { type: action === 'request_frames' ? 'time_travel:frames' : 'time_travel:status', timeoutMs: 3_000 },
      }));
    },
  );

  server.registerTool(
    'feather_session_replay',
    {
      title: 'Session Replay',
      description: 'Control the Session Replay plugin.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum(['start', 'stop', 'request', 'list', 'play', 'seek', 'stop_replay', 'import', 'delete']),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ sessionId, action, data }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const responseType = action === 'list'
        ? 'session_replay:list'
        : action === 'request'
          ? 'session_replay:recording'
          : 'session_replay:status';
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: `cmd:session_replay:${action}`, data },
        waitFor: { type: responseType, timeoutMs: 3_000 },
      }));
    },
  );

  server.registerTool(
    'feather_send_command',
    {
      title: 'Send Raw Feather Command',
      description:
        'Advanced full-control escape hatch. Sends a raw command object after the bridge strips caller-supplied secret fields and applies local auth.',
      inputSchema: {
        sessionId: z.string().optional(),
        message: z.record(z.string(), z.unknown()),
        waitFor: z.object({
          type: z.string().optional(),
          id: z.string().optional(),
          plugin: z.string().optional(),
          action: z.string().optional(),
          timeoutMs: z.number().int().positive().max(10_000).optional(),
        }).optional(),
      },
    },
    async ({ sessionId, message, waitFor }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, { message: stripCallerSecrets(message), waitFor }));
    },
  );

  return server;
}

async function runHttpMcpServer(
  server: McpServer,
  options: { host: string; port: number; token: string },
): Promise<void> {
  if (!isLocalHost(options.host)) {
    fail('MCP HTTP transport only supports localhost hosts by default', {
      details: ['Use 127.0.0.1 or localhost.'],
    });
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }
    if (!httpAuthorized(req, options.token)) {
      writeJson(res, 401, { error: 'Missing or invalid bearer token' });
      return;
    }
    if (!originAllowed(req)) {
      writeJson(res, 403, { error: 'Origin is not allowed' });
      return;
    }

    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(options.port, options.host, resolve));
  printErrorLine(`Feather MCP HTTP server listening on http://${options.host}:${options.port}/mcp`);
  await new Promise<void>((resolve) => httpServer.once('close', resolve));
}

async function resolveSessionId(bridge: DesktopBridgeClient, sessionId?: string): Promise<string> {
  if (sessionId) return sessionId;
  const sessions = (await bridge.listSessions()).sessions?.filter((session) => session.connected !== false) ?? [];
  if (sessions.length === 1) return sessions[0]!.id;
  if (sessions.length === 0) throw new Error('No connected Feather sessions');
  throw new Error(`Multiple Feather sessions are connected; pass sessionId. Sessions: ${sessions.map((s) => s.id).join(', ')}`);
}

function jsonTool(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function jsonResource(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function getSnapshotSection(snapshot: unknown, section: string): unknown {
  if (!isRecord(snapshot)) return null;
  if (section === 'debugger') {
    return {
      status: snapshot.debuggerStatus,
      paused: snapshot.debuggerPaused,
    };
  }
  if (section === 'observers') return snapshot.observers;
  return snapshot[section];
}

function stripCallerSecrets<T extends Record<string, unknown>>(message: T): T {
  const next = { ...message };
  for (const key of Object.keys(next)) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'appid'
      || normalized === 'apikey'
      || normalized === 'token'
      || normalized === 'authorization'
      || normalized.includes('password')
      || normalized.includes('secret')
    ) {
      delete next[key];
    }
  }
  return next;
}

function readSharedMcpConfig(): SharedMcpConfig | null {
  const explicit = process.env.FEATHER_MCP_CONFIG;
  const path = explicit || join(homedir(), '.feather', 'mcp.json');
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as SharedMcpConfig;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isLocalHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function httpAuthorized(req: IncomingMessage, token: string): boolean {
  const auth = req.headers.authorization;
  return auth === `Bearer ${token}`;
}

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin.startsWith('http://127.0.0.1:')
    || origin.startsWith('http://localhost:')
    || origin === 'http://127.0.0.1'
    || origin === 'http://localhost';
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}
