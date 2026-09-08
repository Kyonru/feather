import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail } from '../lib/command.js';
import { printJson, printMuted, printStatus, printWarning } from '../lib/output.js';

const SUPPORTED_CLIENTS = new Set(['codex', 'claude']);
const SUPPORTED_CLAUDE_SCOPES = new Set(['user', 'project', 'local']);
const CODEX_SERVER_SECTION = 'mcp_servers.feather';

export type McpSetupOptions = {
  client?: string;
  codexConfig?: string;
  claudeConfig?: string;
  scope?: string;
  command?: string;
  dryRun?: boolean;
  json?: boolean;
};

type McpSetupClient = 'codex' | 'claude';
type ClaudeScope = 'user' | 'project' | 'local';
type ConfigAction = 'create' | 'append' | 'update' | 'unchanged';

type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
};

type SharedMcpConfigStatus = {
  path: string;
  exists: boolean;
  enabled: boolean | null;
  hasToken: boolean;
  bridgeUrl: string | null;
  parseError?: string;
};

type McpSetupResult = {
  client: McpSetupClient;
  configPath: string;
  configKind: 'codex-toml' | 'claude-json';
  scope?: ClaudeScope;
  projectPath?: string;
  dryRun: boolean;
  action: ConfigAction;
  changed: boolean;
  server: McpServerConfig;
  sharedConfig: SharedMcpConfigStatus;
  restartRequired: boolean;
};

function normalizeClient(client: string | undefined): McpSetupClient {
  const normalized = (client ?? 'codex').trim().toLowerCase();
  if (!SUPPORTED_CLIENTS.has(normalized)) {
    fail('Unsupported MCP setup client', {
      details: ['Use --client codex or --client claude.'],
    });
  }
  return normalized as McpSetupClient;
}

function normalizeClaudeScope(scope: string | undefined): ClaudeScope {
  const normalized = (scope?.trim() || 'user').toLowerCase();
  if (!SUPPORTED_CLAUDE_SCOPES.has(normalized)) {
    fail('Unsupported Claude MCP setup scope', {
      details: ['Use --scope user, --scope project, or --scope local.'],
    });
  }
  return normalized as ClaudeScope;
}

function resolveCodexConfigPath(explicit?: string): string {
  if (explicit?.trim()) return resolve(explicit);
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
  return join(codexHome, 'config.toml');
}

function resolveClaudeConfigPath(scope: ClaudeScope, explicit?: string): string {
  if (explicit?.trim()) return resolve(explicit);
  if (scope === 'project') return resolve(process.cwd(), '.mcp.json');
  return join(homedir(), '.claude.json');
}

function resolveSharedMcpConfigStatus(): SharedMcpConfigStatus {
  const path = resolve(process.env.FEATHER_MCP_CONFIG?.trim() || join(homedir(), '.feather', 'mcp.json'));
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      enabled: null,
      hasToken: false,
      bridgeUrl: null,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return {
      path,
      exists: true,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : null,
      hasToken: typeof parsed.token === 'string' && parsed.token.length > 0,
      bridgeUrl: typeof parsed.bridgeUrl === 'string' && parsed.bridgeUrl.length > 0 ? parsed.bridgeUrl : null,
    };
  } catch (error) {
    return {
      path,
      exists: true,
      enabled: null,
      hasToken: false,
      bridgeUrl: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function commandSupportsMcp(command: string): boolean {
  const result = spawnSync(command, ['mcp', '--help'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 1500,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return !result.error && result.status === 0 && output.includes('Model Context Protocol');
}

function resolveServerConfig(commandOverride?: string): McpServerConfig {
  if (commandOverride?.trim()) {
    return {
      name: 'feather',
      command: commandOverride.trim(),
      args: ['mcp'],
    };
  }

  if (commandSupportsMcp('feather')) {
    return {
      name: 'feather',
      command: 'feather',
      args: ['mcp'],
    };
  }

  const currentCli = process.argv[1] ? resolve(process.argv[1]) : '';
  if (currentCli && existsSync(currentCli) && currentCli.endsWith('.js')) {
    return {
      name: 'feather',
      command: process.execPath,
      args: [currentCli, 'mcp'],
    };
  }

  return {
    name: 'feather',
    command: 'feather',
    args: ['mcp'],
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`;
}

function codexServerBlock(server: McpServerConfig): string {
  return [
    `[${CODEX_SERVER_SECTION}]`,
    `command = ${tomlString(server.command)}`,
    `args = ${tomlArray(server.args)}`,
  ].join('\n');
}

function tomlSectionName(line: string): string | null {
  const match = line.match(/^\s*\[([^\[\]]+)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() ?? null;
}

function isFeatherMcpSection(section: string): boolean {
  return section === CODEX_SERVER_SECTION || section.startsWith(`${CODEX_SERVER_SECTION}.`);
}

function hasFeatherMcpSection(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const section = tomlSectionName(line);
      return section ? isFeatherMcpSection(section) : false;
    });
}

function removeFeatherMcpSections(content: string): string {
  const kept: string[] = [];
  let skipping = false;

  for (const line of content.split(/\r?\n/)) {
    const section = tomlSectionName(line);
    if (section) skipping = isFeatherMcpSection(section);
    if (!skipping) kept.push(line);
  }

  return kept.join('\n').trimEnd();
}

function upsertCodexMcpServer(content: string, server: McpServerConfig): string {
  const base = removeFeatherMcpSections(content);
  const block = codexServerBlock(server);
  return `${base ? `${base}\n\n` : ''}${block}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(content: string, path: string): Record<string, unknown> {
  if (!content.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    fail('Could not read Claude config JSON', {
      details: [
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
        'Fix the JSON or pass --claude-config <path> to write a different file.',
      ],
    });
  }

  if (!isRecord(parsed)) {
    fail('Claude config must be a JSON object', {
      details: [`${path} does not contain an object at the top level.`],
    });
  }
  return parsed;
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = parent[key];
  if (isRecord(existing)) return existing;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function claudeServerConfig(server: McpServerConfig): Record<string, unknown> {
  return {
    type: 'stdio',
    command: server.command,
    args: [...server.args],
  };
}

function isExactClaudeServerConfig(value: unknown, server: McpServerConfig): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3
    && keys[0] === 'args'
    && keys[1] === 'command'
    && keys[2] === 'type'
    && value.type === 'stdio'
    && value.command === server.command
    && Array.isArray(value.args)
    && value.args.length === server.args.length
    && value.args.every((arg, index) => arg === server.args[index]);
}

function currentProjectPath(): string {
  try {
    return realpathSync(process.cwd());
  } catch {
    return resolve(process.cwd());
  }
}

function upsertClaudeMcpServer(
  content: string,
  path: string,
  server: McpServerConfig,
  scope: ClaudeScope,
): { content: string; hadServer: boolean; projectPath?: string } {
  const parsed = readJsonObject(content, path);
  let mcpServers: Record<string, unknown>;
  let projectPath: string | undefined;

  if (scope === 'local') {
    projectPath = currentProjectPath();
    const projects = ensureRecord(parsed, 'projects');
    const project = ensureRecord(projects, projectPath);
    mcpServers = ensureRecord(project, 'mcpServers');
  } else {
    mcpServers = ensureRecord(parsed, 'mcpServers');
  }

  const hadServer = Object.prototype.hasOwnProperty.call(mcpServers, server.name);
  if (isExactClaudeServerConfig(mcpServers[server.name], server)) {
    return {
      content,
      hadServer,
      projectPath,
    };
  }

  mcpServers[server.name] = claudeServerConfig(server);

  return {
    content: `${JSON.stringify(parsed, null, 2)}\n`,
    hadServer,
    projectPath,
  };
}

function actionFor(configExists: boolean, hadServer: boolean, changed: boolean): ConfigAction {
  if (!changed) return 'unchanged';
  if (hadServer) return 'update';
  return configExists ? 'append' : 'create';
}

function clientLabel(client: McpSetupClient): string {
  return client === 'codex' ? 'Codex' : 'Claude Code';
}

function configLabel(result: McpSetupResult): string {
  if (result.client === 'codex') return 'Codex config';
  if (result.scope === 'project') return 'Claude project config';
  if (result.scope === 'local') return 'Claude local config';
  return 'Claude user config';
}

function printHumanResult(result: McpSetupResult): void {
  const label = clientLabel(result.client);
  const verb = result.dryRun
    ? result.changed
      ? `Would ${result.action} Feather MCP for ${label}`
      : `Feather MCP for ${label} is already configured`
    : result.changed
      ? `Feather MCP configured for ${label}`
      : `Feather MCP for ${label} is already configured`;
  printStatus(result.changed && !result.dryRun ? 'success' : 'info', verb);
  printMuted(`  ${configLabel(result)}: ${result.configPath}`);
  if (result.projectPath) {
    printMuted(`  Claude project: ${result.projectPath}`);
  }
  printMuted(`  MCP command: ${[result.server.command, ...result.server.args].join(' ')}`);

  if (!result.sharedConfig.exists) {
    printWarning(`  MCP access file is missing at ${result.sharedConfig.path}`);
    printMuted('  Enable Settings -> Security -> MCP Access in the Feather desktop app before using the MCP server.');
  } else if (result.sharedConfig.parseError) {
    printWarning(`  Could not read ${result.sharedConfig.path}: ${result.sharedConfig.parseError}`);
  } else if (!result.sharedConfig.hasToken) {
    printWarning(`  MCP token is missing in ${result.sharedConfig.path}`);
  } else if (result.sharedConfig.enabled === false) {
    printWarning('  MCP Access is disabled in the Feather desktop app.');
  } else {
    printMuted(`  MCP access file: ${result.sharedConfig.path}`);
  }

  if (result.client === 'claude' && result.scope === 'project') {
    printMuted('  Claude may ask you to approve the project MCP server the next time it opens this project.');
  }

  if (result.restartRequired) {
    printMuted(`  Restart ${label} to load the Feather MCP tools.`);
  } else if (result.dryRun) {
    printMuted(`  Run without --dry-run, then restart ${label} to load the Feather MCP tools.`);
  } else {
    printMuted(`  Restart ${label} if this server was not already loaded in the current session.`);
  }
}

export async function mcpSetupCommand(options: McpSetupOptions): Promise<void> {
  const client = normalizeClient(options.client);
  const server = resolveServerConfig(options.command);
  const sharedConfig = resolveSharedMcpConfigStatus();
  const scope = client === 'claude' ? normalizeClaudeScope(options.scope) : undefined;
  const configPath = client === 'codex'
    ? resolveCodexConfigPath(options.codexConfig)
    : resolveClaudeConfigPath(scope ?? 'user', options.claudeConfig);
  const configExists = existsSync(configPath);
  const previous = configExists ? readFileSync(configPath, 'utf8') : '';
  const config = client === 'codex'
    ? {
      kind: 'codex-toml' as const,
      next: upsertCodexMcpServer(previous, server),
      hadServer: hasFeatherMcpSection(previous),
      projectPath: undefined,
    }
    : (() => {
      const next = upsertClaudeMcpServer(previous, configPath, server, scope ?? 'user');
      return {
        kind: 'claude-json' as const,
        next: next.content,
        hadServer: next.hadServer,
        projectPath: next.projectPath,
      };
    })();
  const next = config.next;
  const changed = next !== previous;

  if (changed && !options.dryRun) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next);
  }

  const result: McpSetupResult = {
    client,
    configPath,
    configKind: config.kind,
    scope,
    projectPath: config.projectPath,
    dryRun: options.dryRun === true,
    action: actionFor(configExists, config.hadServer, changed),
    changed,
    server,
    sharedConfig,
    restartRequired: changed && options.dryRun !== true,
  };

  if (options.json) {
    printJson(result);
    return;
  }

  printHumanResult(result);
}
