import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { pluginCatalog } from '../generated/plugin-catalog.js';
import { fail } from '../lib/command.js';
import { printErrorLine } from '../lib/output.js';

const DEFAULT_DESKTOP_URL = 'http://127.0.0.1:4005';
const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 4006;
const RESOURCE_SECTIONS = ['config', 'logs', 'performance', 'debugger', 'plugins', 'assets', 'observers'] as const;
const CREATIVE_TOOLS = ['shader-graph', 'particle-system-playground', 'texture-lab'] as const;
const PLUGIN_ACTION_NOTES: Record<string, { actions: string[]; notes: string }> = {
  'shader-graph': {
    actions: ['compile-shader', 'preview-shader', 'clear-preview'],
    notes: 'Used by Shader Graph MCP tools for runtime validation and in-game previews.',
  },
  'particle-system-playground': {
    actions: [
      'new-composite',
      'select-composite',
      'select-system',
      'runtime-preview',
      'import-project',
      'delete-composite',
      'add-system',
      'remove-system',
      'reorder-system',
      'restore-composite',
      'set-timeline',
      'timeline-control',
      'set-texture',
      'set-shader',
      'export-project',
      'emit',
      'emit-all',
      'reset',
      'reset-all',
      'kick-start',
      'export-code',
      'export-zip',
    ],
    notes: 'Used by Particle Playground MCP tools for live composite authoring and exports.',
  },
};

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

type CreativeActionRequest = {
  action: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
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

  async getCreative(tool: string): Promise<unknown> {
    return this.request(`/creative/${encodeURIComponent(tool)}`);
  }

  async runCreativeAction(tool: string, body: CreativeActionRequest): Promise<unknown> {
    return this.request(`/creative/${encodeURIComponent(tool)}/action`, {
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

  server.registerResource(
    'feather-plugin-catalog',
    'feather://plugins/catalog',
    {
      title: 'Feather Plugin Catalog',
      description: 'Built-in Feather plugin catalog metadata.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri.href, { plugins: pluginCatalog.map(pluginWithActionNotes) }),
  );

  server.registerResource(
    'feather-plugin-catalog-entry',
    new ResourceTemplate('feather://plugins/{pluginId}', {
      list: async () => ({
        resources: pluginCatalog.map((plugin) => ({
          name: `feather-plugin-${plugin.id}`,
          uri: `feather://plugins/${plugin.id}`,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Feather Plugin Catalog Entry',
      description: 'Built-in metadata for a Feather plugin.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const pluginId = String(variables.pluginId ?? '');
      return jsonResource(uri.href, getPluginCatalogEntry(pluginId));
    },
  );

  server.registerResource(
    'feather-session-plugin',
    new ResourceTemplate('feather://sessions/{sessionId}/plugins/{pluginId}', {
      list: async () => {
        const sessions = (await bridge.listSessions()).sessions ?? [];
        const resources = [];
        for (const session of sessions) {
          const snapshot = await bridge.getSession(session.id).catch(() => null);
          const plugins = isRecord(snapshot) && isRecord(snapshot.plugins) ? Object.keys(snapshot.plugins) : [];
          for (const plugin of plugins) {
            resources.push({
              name: `feather-${session.id}-plugin-${plugin}`,
              uri: `feather://sessions/${session.id}/plugins/${plugin}`,
              mimeType: 'application/json',
            });
          }
        }
        return { resources };
      },
    }),
    {
      title: 'Feather Live Plugin State',
      description: 'Live plugin payload for a Feather session.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const snapshot = await bridge.getSession(String(variables.sessionId ?? ''));
      return jsonResource(uri.href, getLivePluginState(snapshot, String(variables.pluginId ?? '')));
    },
  );

  server.registerResource(
    'feather-creative-tool',
    new ResourceTemplate('feather://creative/{tool}', {
      list: async () => ({
        resources: CREATIVE_TOOLS.map((tool) => ({
          name: `feather-creative-${tool}`,
          uri: `feather://creative/${tool}`,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Feather Creative Tool Snapshot',
      description: 'Desktop-local Shader Graph, Particle Playground, or Texture Lab snapshot.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const tool = String(variables.tool ?? '');
      if (!CREATIVE_TOOLS.includes(tool as typeof CREATIVE_TOOLS[number])) {
        throw new Error(`Unknown Feather creative resource: ${tool}`);
      }
      return jsonResource(uri.href, await bridge.getCreative(tool));
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
    'feather_list_plugins',
    {
      title: 'List Feather Plugins',
      description: 'List built-in Feather plugin catalog entries and known MCP action notes.',
    },
    async () => jsonTool({ plugins: pluginCatalog.map(pluginWithActionNotes) }),
  );

  server.registerTool(
    'feather_get_plugin',
    {
      title: 'Get Plugin Metadata',
      description: 'Get built-in catalog metadata and known action notes for a Feather plugin.',
      inputSchema: { plugin: z.string() },
    },
    async ({ plugin }) => jsonTool(getPluginCatalogEntry(plugin)),
  );

  server.registerTool(
    'feather_get_live_plugin_state',
    {
      title: 'Get Live Plugin State',
      description: 'Get the latest live payload for a plugin in a Feather session.',
      inputSchema: {
        sessionId: z.string().optional(),
        plugin: z.string(),
      },
    },
    async ({ sessionId, plugin }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(getLivePluginState(await bridge.getSession(id), plugin));
    },
  );

  server.registerTool(
    'feather_refresh_plugin',
    {
      title: 'Refresh Plugin Payloads',
      description: 'Ask the runtime to push fresh plugin payloads, then return the selected plugin if provided.',
      inputSchema: {
        sessionId: z.string().optional(),
        plugin: z.string().optional(),
      },
    },
    async ({ sessionId, plugin }) => {
      const id = await resolveSessionId(bridge, sessionId);
      await bridge.sendCommand(id, { message: { type: 'req:plugins' } });
      const snapshot = await bridge.getSession(id);
      return jsonTool(plugin ? getLivePluginState(snapshot, plugin) : getSnapshotSection(snapshot, 'plugins'));
    },
  );

  server.registerTool(
    'feather_create_shader',
    {
      title: 'Create Shader',
      description: 'Create a Shader Graph workspace shader from graph JSON or standalone GLSL, with optional live-game validation.',
      inputSchema: {
        sessionId: z.string().optional(),
        shaderName: z.string().optional(),
        graph: z.record(z.string(), z.unknown()).optional(),
        raw: z.string().optional(),
        pixelSource: z.string().optional(),
        vertexSource: z.string().optional(),
        parameters: z.array(z.record(z.string(), z.unknown())).optional(),
        textures: z.array(z.record(z.string(), z.unknown())).optional(),
        previewShape: z.enum(['circle', 'line', 'rectangle']).optional(),
        previewColor: z.string().optional(),
        validateInGame: z.boolean().optional(),
        previewInGame: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, validateInGame, previewInGame, timeoutMs, ...params }) => {
      const created = await creativeResponse(bridge, 'shader-graph', 'create', params, timeoutMs);
      if (!validateInGame && !previewInGame) return jsonTool(created);

      const glsl = extractShaderGlsl(created);
      if (!glsl.pixel) {
        throw new Error('Created shader did not return pixel GLSL for runtime use');
      }
      const id = await resolveSessionId(bridge, sessionId);
      const runtime: Record<string, unknown> = {};
      if (validateInGame) {
        runtime.validation = await bridge.sendCommand(id, {
          message: {
            type: 'cmd:plugin:action',
            plugin: 'shader-graph',
            action: 'compile-shader',
            params: {
              pixelSource: glsl.pixel,
              vertexSource: glsl.vertex ?? '',
            },
          },
          waitFor: { type: 'plugin:action:response', plugin: 'shader-graph', action: 'compile-shader', timeoutMs },
        });
      }
      if (previewInGame) {
        runtime.preview = await bridge.sendCommand(id, {
          message: {
            type: 'cmd:plugin:action',
            plugin: 'shader-graph',
            action: 'preview-shader',
            params: stripUndefined({
              pixelSource: glsl.pixel,
              vertexSource: glsl.vertex ?? '',
              shape: params.previewShape,
              color: params.previewColor,
            }),
          },
          waitFor: { type: 'plugin:action:response', plugin: 'shader-graph', action: 'preview-shader', timeoutMs },
        });
      }
      return jsonTool({ created, runtime });
    },
  );

  server.registerTool(
    'feather_create_particle_system',
    {
      title: 'Create Particle System',
      description: 'Create a Particle Playground composite, optionally apply params/assets, emit it, and return exports.',
      inputSchema: {
        sessionId: z.string().optional(),
        name: z.string().optional(),
        template: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        texture: z.record(z.string(), z.unknown()).optional(),
        shader: z.record(z.string(), z.unknown()).optional(),
        emitCount: z.number().int().positive().optional(),
        exportProject: z.boolean().optional(),
        exportCode: z.boolean().optional(),
        exportZip: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({
      sessionId,
      name,
      template,
      params,
      texture,
      shader,
      emitCount,
      exportProject,
      exportCode,
      exportZip,
      timeoutMs,
    }) => {
      const created = await particleAction(bridge, sessionId, 'new-composite', stripUndefined({ name, template }), timeoutMs);
      const composite = extractParticleComposite(created, name);
      const target: Record<string, unknown> = composite ? { composite } : {};
      const result: Record<string, unknown> = { created, composite: composite ?? null };

      if (params) {
        const id = await resolveSessionId(bridge, sessionId);
        result.params = await bridge.sendCommand(id, {
          message: {
            type: 'cmd:plugin:params',
            plugin: 'particle-system-playground',
            params: stripUndefined({ ...target, ...params }),
          },
        });
      }
      if (texture) {
        result.texture = await particleAction(bridge, sessionId, 'set-texture', stripUndefined({ ...target, ...texture }), timeoutMs);
      }
      if (shader) {
        result.shader = await particleAction(bridge, sessionId, 'set-shader', stripUndefined({ ...target, ...shader }), timeoutMs);
      }
      if (emitCount) {
        result.emit = await particleAction(bridge, sessionId, 'emit', stripUndefined({ ...target, count: emitCount }), timeoutMs);
      }
      if (exportProject) {
        result.project = await particleAction(bridge, sessionId, 'export-project', target, timeoutMs);
      }
      if (exportCode) {
        result.code = await particleAction(bridge, sessionId, 'export-code', target, timeoutMs);
      }
      if (exportZip) {
        result.zip = await particleAction(bridge, sessionId, 'export-zip', target, timeoutMs);
      }

      return jsonTool(result);
    },
  );

  server.registerTool(
    'feather_create_texture',
    {
      title: 'Create Texture',
      description: 'Create a Texture Lab PNG or atlas payload from a recipe without writing files.',
      inputSchema: {
        recipe: z.record(z.string(), z.unknown()).optional(),
        generator: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        atlas: z.record(z.string(), z.unknown()).optional(),
        saveAs: z.string().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ recipe, generator, width, height, atlas, saveAs, timeoutMs }) => {
      const nextRecipe = stripUndefined({
        ...(recipe ?? {}),
        generator,
        width,
        height,
      });
      const savedRecipe = saveAs
        ? await creativeResponse(bridge, 'texture-lab', 'save-recipe', { name: saveAs, recipe: nextRecipe }, timeoutMs)
        : null;
      const generated = await creativeResponse(
        bridge,
        'texture-lab',
        atlas ? 'generate-atlas' : 'generate',
        atlas ? { recipe: nextRecipe, atlas } : { recipe: nextRecipe },
        timeoutMs,
      );
      return jsonTool({ generated, savedRecipe });
    },
  );

  server.registerTool(
    'feather_shader_graph_snapshot',
    {
      title: 'Shader Graph Snapshot',
      description: 'Get the desktop-local Shader Graph workspace snapshot.',
    },
    async () => jsonTool(await bridge.getCreative('shader-graph')),
  );

  server.registerTool(
    'feather_shader_graph_compile',
    {
      title: 'Compile Shader Graph',
      description: 'Generate GLSL from the current or provided Shader Graph and optionally validate it in a live game.',
      inputSchema: {
        sessionId: z.string().optional(),
        graph: z.record(z.string(), z.unknown()).optional(),
        raw: z.string().optional(),
        validateInGame: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, graph, raw, validateInGame, timeoutMs }) => {
      const compiled = await creativeResponse(bridge, 'shader-graph', 'compile', { graph, raw }, timeoutMs);
      if (!validateInGame) return jsonTool(compiled);
      const id = await resolveSessionId(bridge, sessionId);
      const glsl = isRecord(compiled) && isRecord(compiled.glsl) ? compiled.glsl : {};
      const runtime = await bridge.sendCommand(id, {
        message: {
          type: 'cmd:plugin:action',
          plugin: 'shader-graph',
          action: 'compile-shader',
          params: {
            pixelSource: typeof glsl.pixel === 'string' ? glsl.pixel : '',
            vertexSource: typeof glsl.vertex === 'string' ? glsl.vertex : '',
          },
        },
        waitFor: { type: 'plugin:action:response', plugin: 'shader-graph', action: 'compile-shader', timeoutMs },
      });
      return jsonTool({ compiled, runtime });
    },
  );

  server.registerTool(
    'feather_shader_graph_preview',
    {
      title: 'Preview Shader Graph',
      description: 'Compile current Shader Graph preview params and show the shader preview in a live game.',
      inputSchema: {
        sessionId: z.string().optional(),
        graph: z.record(z.string(), z.unknown()).optional(),
        raw: z.string().optional(),
        shape: z.enum(['circle', 'line', 'rectangle']).optional(),
        color: z.string().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, graph, raw, shape, color, timeoutMs }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const params = await creativeResponse(bridge, 'shader-graph', 'preview-params', { graph, raw, shape, color }, timeoutMs);
      const previewParams = isRecord(params) ? withoutKeys(params, ['diagnostics', 'hasBlockingDiagnostics']) : {};
      const runtime = await bridge.sendCommand(id, {
        message: {
          type: 'cmd:plugin:action',
          plugin: 'shader-graph',
          action: 'preview-shader',
          params: previewParams,
        },
        waitFor: { type: 'plugin:action:response', plugin: 'shader-graph', action: 'preview-shader', timeoutMs },
      });
      return jsonTool({ preview: params, runtime });
    },
  );

  server.registerTool(
    'feather_shader_graph_clear_preview',
    {
      title: 'Clear Shader Graph Preview',
      description: 'Clear the Shader Graph runtime preview in a live game.',
      inputSchema: {
        sessionId: z.string().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, timeoutMs }) => {
      await creativeResponse(bridge, 'shader-graph', 'clear-preview', {}, timeoutMs).catch(() => ({ ok: false }));
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:plugin:action', plugin: 'shader-graph', action: 'clear-preview', params: {} },
        waitFor: { type: 'plugin:action:response', plugin: 'shader-graph', action: 'clear-preview', timeoutMs },
      }));
    },
  );

  server.registerTool(
    'feather_shader_graph_import',
    {
      title: 'Import Shader Graph',
      description: 'Import a Shader Graph JSON payload into the desktop workspace.',
      inputSchema: {
        graph: z.record(z.string(), z.unknown()).optional(),
        raw: z.string().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ graph, raw, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'shader-graph', 'import', { graph, raw }, timeoutMs)),
  );

  server.registerTool(
    'feather_shader_graph_export',
    {
      title: 'Export Shader Graph',
      description: 'Export the current Shader Graph workspace as JSON content.',
      inputSchema: { timeoutMs: z.number().int().positive().max(10_000).optional() },
    },
    async ({ timeoutMs }) => jsonTool(await creativeResponse(bridge, 'shader-graph', 'export', {}, timeoutMs)),
  );

  server.registerTool(
    'feather_particles_snapshot',
    {
      title: 'Particle Playground Snapshot',
      description: 'Get the live Particle Playground plugin payload for a session.',
      inputSchema: { sessionId: z.string().optional() },
    },
    async ({ sessionId }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(getLivePluginState(await bridge.getSession(id), 'particle-system-playground'));
    },
  );

  server.registerTool(
    'feather_particles_new_composite',
    {
      title: 'Create Particle Composite',
      description: 'Create a Particle Playground scratch composite.',
      inputSchema: particleToolSchema({ name: z.string().optional(), template: z.string().optional() }),
    },
    async ({ sessionId, timeoutMs, ...params }) => particleActionTool(bridge, sessionId, 'new-composite', params, timeoutMs),
  );

  server.registerTool(
    'feather_particles_select',
    {
      title: 'Select Particle Composite Or Emitter',
      description: 'Select a Particle Playground composite and/or emitter index.',
      inputSchema: {
        sessionId: z.string().optional(),
        composite: z.string().optional(),
        systemIndex: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, composite, systemIndex, timeoutMs }) => {
      if (composite) await particleAction(bridge, sessionId, 'select-composite', { composite }, timeoutMs);
      if (systemIndex) return particleActionTool(bridge, sessionId, 'select-system', { composite, systemIndex }, timeoutMs);
      return jsonTool({ ok: true });
    },
  );

  server.registerTool(
    'feather_particles_set_params',
    {
      title: 'Set Particle Parameters',
      description: 'Update Particle Playground params for the active or selected composite/emitter.',
      inputSchema: {
        sessionId: z.string().optional(),
        params: z.record(z.string(), z.unknown()),
      },
    },
    async ({ sessionId, params }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(await bridge.sendCommand(id, {
        message: { type: 'cmd:plugin:params', plugin: 'particle-system-playground', params },
      }));
    },
  );

  server.registerTool(
    'feather_particles_action',
    {
      title: 'Run Particle Playground Action',
      description: 'Run any Particle Playground plugin action with params.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, action, params, timeoutMs }) => particleActionTool(bridge, sessionId, action, params ?? {}, timeoutMs),
  );

  server.registerTool(
    'feather_particles_export_project',
    {
      title: 'Export Particle Project',
      description: 'Export the active Particle Playground composite as a .featherparticles payload.',
      inputSchema: particleToolSchema({ composite: z.string().optional() }),
    },
    async ({ sessionId, timeoutMs, ...params }) => particleActionTool(bridge, sessionId, 'export-project', params, timeoutMs),
  );

  server.registerTool(
    'feather_particles_export_code',
    {
      title: 'Export Particle Lua Code',
      description: 'Export the active Particle Playground composite as Lua source text.',
      inputSchema: particleToolSchema({ composite: z.string().optional() }),
    },
    async ({ sessionId, timeoutMs, ...params }) => particleActionTool(bridge, sessionId, 'export-code', params, timeoutMs),
  );

  server.registerTool(
    'feather_particles_export_zip',
    {
      title: 'Export Particle ZIP Payload',
      description: 'Export the active Particle Playground composite as base64 ZIP asset payload metadata.',
      inputSchema: particleToolSchema({ composite: z.string().optional() }),
    },
    async ({ sessionId, timeoutMs, ...params }) => particleActionTool(bridge, sessionId, 'export-zip', params, timeoutMs),
  );

  server.registerTool(
    'feather_texture_lab_generators',
    {
      title: 'Texture Lab Generators',
      description: 'List Texture Lab procedural generator metadata.',
      inputSchema: { timeoutMs: z.number().int().positive().max(10_000).optional() },
    },
    async ({ timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'generators', {}, timeoutMs)),
  );

  server.registerTool(
    'feather_texture_lab_snapshot',
    {
      title: 'Texture Lab Snapshot',
      description: 'Get the desktop-local Texture Lab workspace snapshot.',
    },
    async () => jsonTool(await bridge.getCreative('texture-lab')),
  );

  server.registerTool(
    'feather_texture_lab_set_recipe',
    {
      title: 'Set Texture Lab Recipe',
      description: 'Merge recipe fields into the current Texture Lab workspace.',
      inputSchema: {
        recipe: z.record(z.string(), z.unknown()),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ recipe, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'set-recipe', { recipe }, timeoutMs)),
  );

  server.registerTool(
    'feather_texture_lab_save_recipe',
    {
      title: 'Save Texture Lab Recipe',
      description: 'Save a named Texture Lab recipe in the desktop workspace.',
      inputSchema: {
        name: z.string(),
        recipe: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ name, recipe, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'save-recipe', { name, recipe }, timeoutMs)),
  );

  server.registerTool(
    'feather_texture_lab_delete_recipe',
    {
      title: 'Delete Texture Lab Recipe',
      description: 'Delete a saved Texture Lab recipe by id.',
      inputSchema: {
        id: z.string(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ id, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'delete-recipe', { id }, timeoutMs)),
  );

  server.registerTool(
    'feather_texture_lab_generate',
    {
      title: 'Generate Texture Lab Texture',
      description: 'Generate a Texture Lab PNG payload as base64 metadata without writing files.',
      inputSchema: {
        recipe: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ recipe, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'generate', { recipe }, timeoutMs)),
  );

  server.registerTool(
    'feather_texture_lab_generate_atlas',
    {
      title: 'Generate Texture Lab Atlas',
      description: 'Generate a Texture Lab atlas sheet and frame payloads as base64 metadata without writing files.',
      inputSchema: {
        recipe: z.record(z.string(), z.unknown()).optional(),
        atlas: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ recipe, atlas, timeoutMs }) => jsonTool(await creativeResponse(bridge, 'texture-lab', 'generate-atlas', { recipe, atlas }, timeoutMs)),
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
    'feather_debugger_state',
    {
      title: 'Get Debugger State',
      description: 'Get debugger status, paused frame state, source-line context, and recent logs for a live session.',
      inputSchema: debuggerStateSchema(),
    },
    async ({ sessionId, includeLogs, logLimit, includeSource, contextLines }) => {
      const id = await resolveSessionId(bridge, sessionId);
      return jsonTool(debuggerStatePayload(id, await bridge.getSession(id), {
        includeLogs,
        logLimit,
        includeSource,
        contextLines,
      }));
    },
  );

  server.registerTool(
    'feather_debugger_enable',
    {
      title: 'Enable Debugger',
      description: 'Enable the Feather step debugger and optionally set pause-on-error.',
      inputSchema: {
        sessionId: z.string().optional(),
        pauseOnError: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, pauseOnError, timeoutMs }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const enabled = await bridge.sendCommand(id, {
        message: { type: 'cmd:debugger:enable' },
        waitFor: { type: 'debugger:status', timeoutMs },
      });
      const options = pauseOnError === undefined ? null : await bridge.sendCommand(id, {
        message: { type: 'cmd:debugger:set_options', data: { pauseOnError } },
        waitFor: { type: 'debugger:status', timeoutMs },
      });
      return jsonTool({
        enabled,
        options,
        state: debuggerStatePayload(id, await bridge.getSession(id), { includeLogs: true, includeSource: true }),
      });
    },
  );

  server.registerTool(
    'feather_debugger_set_breakpoints',
    {
      title: 'Set Debugger Breakpoints',
      description: 'Set or merge Lua breakpoints, then return debugger state with any rejected breakpoint details.',
      inputSchema: {
        sessionId: z.string().optional(),
        mode: z.enum(['merge', 'replace']).optional(),
        breakpoints: z.array(z.object({
          file: z.string(),
          line: z.number().int().positive(),
          condition: z.string().optional(),
          enabled: z.boolean().optional(),
        })),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ sessionId, mode, breakpoints, timeoutMs }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const snapshot = await bridge.getSession(id);
      const current = mode === 'replace' ? [] : currentDebuggerBreakpoints(snapshot);
      const next = mergeBreakpoints(current, breakpoints);
      const response = await bridge.sendCommand(id, {
        message: { type: 'cmd:debugger:set_breakpoints', data: { breakpoints: next } },
        waitFor: { type: 'debugger:status', timeoutMs },
      });
      return jsonTool({
        response,
        breakpoints: next,
        state: debuggerStatePayload(id, await bridge.getSession(id), { includeLogs: true, includeSource: true }),
      });
    },
  );

  server.registerTool(
    'feather_debugger_step',
    {
      title: 'Step Debugger',
      description: 'Step over, into, or out from the current debugger pause and return the next paused state.',
      inputSchema: {
        sessionId: z.string().optional(),
        action: z.enum(['over', 'into', 'out']),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
        includeLogs: z.boolean().optional(),
        logLimit: z.number().int().positive().max(500).optional(),
        includeSource: z.boolean().optional(),
        contextLines: z.number().int().nonnegative().max(50).optional(),
      },
    },
    async ({ sessionId, action, timeoutMs, includeLogs, logLimit, includeSource, contextLines }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const commandType = {
        over: 'cmd:debugger:step_over',
        into: 'cmd:debugger:step_into',
        out: 'cmd:debugger:step_out',
      }[action];
      const response = await bridge.sendCommand(id, {
        message: { type: commandType },
        waitFor: { type: 'debugger:paused', timeoutMs },
      });
      return jsonTool({
        response,
        state: debuggerStatePayload(id, await bridge.getSession(id), {
          includeLogs,
          logLimit,
          includeSource,
          contextLines,
        }),
      });
    },
  );

  server.registerTool(
    'feather_debugger_continue',
    {
      title: 'Continue Debugger',
      description: 'Resume execution from the current debugger pause and return updated debugger state.',
      inputSchema: debuggerCommandStateSchema(),
    },
    async ({ sessionId, timeoutMs, includeLogs, logLimit, includeSource, contextLines }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const response = await bridge.sendCommand(id, {
        message: { type: 'cmd:debugger:continue' },
        waitFor: { type: 'debugger:resumed', timeoutMs },
      });
      return jsonTool({
        response,
        state: debuggerStatePayload(id, await bridge.getSession(id), {
          includeLogs,
          logLimit,
          includeSource,
          contextLines,
        }),
      });
    },
  );

  server.registerTool(
    'feather_debugger_inspect_frame',
    {
      title: 'Inspect Debugger Frame',
      description: 'Request locals and upvalues for a paused stack frame, then return frame state and source context.',
      inputSchema: {
        sessionId: z.string().optional(),
        index: z.number().int().nonnegative(),
        timeoutMs: z.number().int().positive().max(10_000).optional(),
        includeSource: z.boolean().optional(),
        contextLines: z.number().int().nonnegative().max(50).optional(),
      },
    },
    async ({ sessionId, index, timeoutMs, includeSource, contextLines }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const response = await bridge.sendCommand(id, {
        message: { type: 'cmd:debugger:inspect_frame', data: { index } },
        waitFor: { type: 'debugger:frame', timeoutMs },
      });
      return jsonTool({
        response,
        state: debuggerStatePayload(id, await bridge.getSession(id), {
          includeLogs: false,
          includeSource,
          contextLines,
          frameIndex: index,
        }),
      });
    },
  );

  server.registerTool(
    'feather_debugger_line_context',
    {
      title: 'Get Debugger Line Context',
      description: 'Read source lines around a paused debugger frame or an explicit file/line inside the game source root.',
      inputSchema: {
        sessionId: z.string().optional(),
        file: z.string().optional(),
        line: z.number().int().positive().optional(),
        frameIndex: z.number().int().nonnegative().optional(),
        contextLines: z.number().int().nonnegative().max(50).optional(),
      },
    },
    async ({ sessionId, file, line, frameIndex, contextLines }) => {
      const id = await resolveSessionId(bridge, sessionId);
      const snapshot = await bridge.getSession(id);
      return jsonTool(debuggerLineContext(snapshot, { file, line, frameIndex, contextLines }));
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

function pluginWithActionNotes(plugin: typeof pluginCatalog[number]) {
  return {
    ...plugin,
    mcp: PLUGIN_ACTION_NOTES[plugin.id] ?? null,
  };
}

function getPluginCatalogEntry(pluginId: string): unknown {
  const plugin = pluginCatalog.find((entry) => entry.id === pluginId);
  if (!plugin) throw new Error(`Unknown Feather plugin: ${pluginId}`);
  return pluginWithActionNotes(plugin);
}

function getLivePluginState(snapshot: unknown, pluginId: string): unknown {
  if (!isRecord(snapshot) || !isRecord(snapshot.plugins)) {
    return { plugin: pluginId, state: null };
  }
  return {
    plugin: pluginId,
    catalog: pluginCatalog.find((entry) => entry.id === pluginId) ? getPluginCatalogEntry(pluginId) : null,
    state: snapshot.plugins[pluginId] ?? null,
  };
}

function debuggerStateSchema() {
  return {
    sessionId: z.string().optional(),
    includeLogs: z.boolean().optional(),
    logLimit: z.number().int().positive().max(500).optional(),
    includeSource: z.boolean().optional(),
    contextLines: z.number().int().nonnegative().max(50).optional(),
  };
}

function debuggerCommandStateSchema() {
  return {
    ...debuggerStateSchema(),
    timeoutMs: z.number().int().positive().max(10_000).optional(),
  };
}

type McpBreakpoint = {
  file: string;
  line: number;
  condition?: string;
  enabled?: boolean;
};

function debuggerStatus(snapshot: unknown): Record<string, unknown> | null {
  return isRecord(snapshot) && isRecord(snapshot.debuggerStatus) ? snapshot.debuggerStatus : null;
}

function debuggerPaused(snapshot: unknown): Record<string, unknown> | null {
  return isRecord(snapshot) && isRecord(snapshot.debuggerPaused) ? snapshot.debuggerPaused : null;
}

function currentDebuggerBreakpoints(snapshot: unknown): McpBreakpoint[] {
  const status = debuggerStatus(snapshot);
  const breakpoints = Array.isArray(status?.breakpoints) ? status.breakpoints : [];
  return breakpoints
    .map((entry) => normalizeBreakpoint(entry))
    .filter((entry): entry is McpBreakpoint => !!entry);
}

function normalizeBreakpoint(entry: unknown): McpBreakpoint | null {
  if (!isRecord(entry) || typeof entry.file !== 'string') return null;
  const line = Number(entry.line);
  if (!Number.isFinite(line) || line < 1) return null;
  const condition = typeof entry.condition === 'string' && entry.condition.trim() ? entry.condition : undefined;
  return {
    file: entry.file,
    line: Math.floor(line),
    ...(condition && { condition }),
    ...(entry.enabled === false && { enabled: false }),
  };
}

function mergeBreakpoints(current: unknown[], requested: unknown[]): McpBreakpoint[] {
  const byKey = new Map<string, McpBreakpoint>();
  for (const entry of [...current, ...requested]) {
    const normalized = normalizeBreakpoint(entry);
    if (!normalized || normalized.enabled === false) continue;
    const active = { ...normalized };
    delete active.enabled;
    byKey.set(`${normalized.file}:${normalized.line}`, active);
  }
  return Array.from(byKey.values()).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function debuggerStatePayload(
  sessionId: string,
  snapshot: unknown,
  options: {
    includeLogs?: boolean;
    logLimit?: number;
    includeSource?: boolean;
    contextLines?: number;
    frameIndex?: number;
  } = {},
) {
  const status = debuggerStatus(snapshot);
  const paused = debuggerPaused(snapshot);
  const includeLogs = options.includeLogs !== false;
  const includeSource = options.includeSource !== false;
  return {
    sessionId,
    status,
    paused,
    lineContext: includeSource
      ? debuggerLineContext(snapshot, {
        contextLines: options.contextLines,
        frameIndex: options.frameIndex,
      })
      : null,
    logs: includeLogs ? tailLogs(snapshot, options.logLimit) : [],
  };
}

function tailLogs(snapshot: unknown, limit?: number): unknown[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.logs)) return [];
  return snapshot.logs.slice(-boundedInt(limit, 50, 500));
}

function debuggerLineContext(
  snapshot: unknown,
  options: {
    file?: string;
    line?: number;
    frameIndex?: number;
    contextLines?: number;
  } = {},
) {
  const status = debuggerStatus(snapshot);
  const paused = debuggerPaused(snapshot);
  const sourceRoot = typeof status?.sourceRoot === 'string' ? status.sourceRoot : '';
  const target = debuggerLineTarget(paused, options);
  if (!sourceRoot.trim()) {
    return { available: false, reason: 'Debugger sourceRoot is unavailable', target };
  }
  if (!target.file || !target.line) {
    return { available: false, reason: 'No paused file/line or explicit file/line was provided', sourceRoot, target };
  }
  const path = resolveSourcePath(sourceRoot, target.file);
  if (!path) {
    return { available: false, reason: 'Requested file is outside debugger sourceRoot', sourceRoot, target };
  }
  if (!existsSync(path)) {
    return { available: false, reason: 'Source file was not found on disk', sourceRoot, target };
  }
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const contextLines = boundedInt(options.contextLines, 5, 50);
    const line = Math.max(1, Math.min(target.line, lines.length || 1));
    const startLine = Math.max(1, line - contextLines);
    const endLine = Math.min(lines.length, line + contextLines);
    return {
      available: true,
      sourceRoot,
      file: target.file,
      line,
      startLine,
      endLine,
      lines: lines.slice(startLine - 1, endLine).map((text, index) => {
        const number = startLine + index;
        return {
          number,
          text,
          isTarget: number === line,
        };
      }),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      sourceRoot,
      target,
    };
  }
}

function debuggerLineTarget(
  paused: Record<string, unknown> | null,
  options: { file?: string; line?: number; frameIndex?: number },
): { file?: string; line?: number } {
  if (options.file && options.line) return { file: options.file, line: options.line };
  if (Number.isInteger(options.frameIndex) && Array.isArray(paused?.stack)) {
    const frame = paused.stack.find((entry) => isRecord(entry) && Number(entry.index) === options.frameIndex);
    if (isRecord(frame) && typeof frame.file === 'string' && Number.isFinite(Number(frame.line))) {
      return { file: frame.file, line: Math.floor(Number(frame.line)) };
    }
  }
  if (paused && typeof paused.file === 'string' && Number.isFinite(Number(paused.line))) {
    return { file: paused.file, line: Math.floor(Number(paused.line)) };
  }
  return {};
}

function resolveSourcePath(sourceRoot: string, file: string): string | null {
  const root = resolve(sourceRoot);
  const candidate = isAbsolute(file) ? resolve(file) : resolve(root, file);
  const rel = relative(root, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return candidate;
  return null;
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(next)));
}

function extractShaderGlsl(value: unknown): { pixel?: string; vertex?: string } {
  const glsl = findRecordField(value, 'glsl');
  return {
    pixel: typeof glsl?.pixel === 'string' ? glsl.pixel : undefined,
    vertex: typeof glsl?.vertex === 'string' ? glsl.vertex : undefined,
  };
}

function extractParticleComposite(value: unknown, fallback?: string): string | undefined {
  const composite = findStringField(value, 'composite');
  if (composite) return composite;
  return fallback?.trim() || undefined;
}

function findRecordField(value: unknown, field: string, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5 || !isRecord(value)) return undefined;
  if (isRecord(value[field])) return value[field];
  for (const key of ['response', 'data', 'result', 'created', 'compiled']) {
    const found = findRecordField(value[key], field, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findStringField(value: unknown, field: string, depth = 0): string | undefined {
  if (depth > 5 || !isRecord(value)) return undefined;
  const direct = value[field];
  if (typeof direct === 'string' && direct.trim()) return direct;
  for (const key of ['response', 'data', 'result', 'created']) {
    const found = findStringField(value[key], field, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function particleToolSchema<T extends z.ZodRawShape>(shape: T) {
  return {
    sessionId: z.string().optional(),
    ...shape,
    timeoutMs: z.number().int().positive().max(10_000).optional(),
  };
}

async function particleAction(
  bridge: DesktopBridgeClient,
  sessionId: string | undefined,
  action: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
): Promise<unknown> {
  const id = await resolveSessionId(bridge, sessionId);
  return bridge.sendCommand(id, {
    message: {
      type: 'cmd:plugin:action',
      plugin: 'particle-system-playground',
      action,
      params,
    },
    waitFor: {
      type: 'plugin:action:response',
      plugin: 'particle-system-playground',
      action,
      timeoutMs,
    },
  });
}

async function particleActionTool(
  bridge: DesktopBridgeClient,
  sessionId: string | undefined,
  action: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
) {
  return jsonTool(await particleAction(bridge, sessionId, action, stripUndefined(params), timeoutMs));
}

async function creativeResponse(
  bridge: DesktopBridgeClient,
  tool: string,
  action: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
): Promise<unknown> {
  const result = await bridge.runCreativeAction(tool, {
    action,
    params: stripUndefined(params),
    timeoutMs,
  });
  if (!isRecord(result)) return result;
  if (result.ok === false) {
    throw new Error(typeof result.error === 'string' ? result.error : `Creative action failed: ${tool}/${action}`);
  }
  return Object.prototype.hasOwnProperty.call(result, 'response') ? result.response : result;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function withoutKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const skipped = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !skipped.has(key)));
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
