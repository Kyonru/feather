import type { ReactNode } from "react";
import { pluginCatalog } from "../../generated/plugin-catalog.js";

export type InitMode = "cli" | "auto" | "manual";

export type InitSetup = {
  mode: InitMode;
  source: "local" | "remote";
  branch: string;
  installDir: string;
  installPlugins: boolean;
  config: Record<string, unknown>;
  exclude: string[];
};

export type Phase =
  | "mode"
  | "installDir"
  | "source"
  | "branch"
  | "sessionName"
  | "installPlugins"
  | "include"
  | "exclude"
  | "advanced"
  | "host"
  | "port"
  | "modeConfig"
  | "baseDir"
  | "sampleRate"
  | "updateInterval"
  | "maxTempLogs"
  | "outputDir"
  | "retryInterval"
  | "connectTimeout"
  | "errorWait"
  | "binaryTextThreshold"
  | "deviceId"
  | "capabilities"
  | "toggles"
  | "apiKey"
  | "appId"
  | "summary";

export type Option<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

export type Tone = "info" | "success" | "warning" | "danger";

export type SummaryRow = {
  id: string;
  label: string;
  value: ReactNode;
  tone?: Tone;
};

export const dangerousInsecureConnection = "__DANGEROUS_INSECURE_CONNECTION__";
export const dangerousPluginIds = new Set(["console", "hot-reload"]);
export const dangerousToggleIds = new Set(["debugger", "captureScreenshot"]);
export const warningToggleIds = new Set(["autoRegisterErrorHandler", "writeToDisk"]);

export const toneColor = (tone?: Tone) => {
  if (tone === "danger") return "red";
  if (tone === "warning") return "yellow";
  if (tone === "success") return "green";
  if (tone === "info") return "cyan";
  return undefined;
};

export const pluginTone = (value: string): Tone | undefined => (dangerousPluginIds.has(value) ? "danger" : undefined);
export const toggleTone = (value: string): Tone | undefined => {
  if (dangerousToggleIds.has(value)) return "danger";
  if (warningToggleIds.has(value)) return "warning";
  return undefined;
};

export const modes: Option<InitMode>[] = [
  {
    value: "cli",
    label: "CLI injection",
    description: "Create feather.config.lua only. Run with `feather run .`.",
  },
  {
    value: "auto",
    label: "Auto require",
    description: 'Patch main.lua with a USE_DEBUGGER-guarded require("feather.auto").',
  },
  {
    value: "manual",
    label: "Manual setup",
    description: "Create feather.debugger.lua and load it when USE_DEBUGGER is set.",
  },
];

export const installSources: Option<"local" | "remote">[] = [
  {
    value: "local",
    label: "Bundled/local copy",
    description: "Copy the CLI-bundled Lua runtime, or src-lua when running from the repo.",
  },
  {
    value: "remote",
    label: "GitHub download",
    description: "Fetch files from GitHub using the selected branch or tag.",
  },
];

const pluginToOption = (plugin: (typeof pluginCatalog)[number]): Option => ({
  value: plugin.id,
  label: plugin.name,
  description: plugin.description,
});

export const optionalPlugins: Option[] = pluginCatalog.filter((plugin) => plugin.optIn).map(pluginToOption);
export const skipPluginOptions: Option[] = pluginCatalog.map(pluginToOption);
export const defaultSkippedPlugins = new Set(["console", "hot-reload", "hump.signal", "lua-state-machine"]);

export const configToggles: Option[] = [
  { value: "debug", label: "Enable Feather", description: "Set debug = true." },
  { value: "wrapPrint", label: "Wrap print()", description: "Send print output to Logs." },
  { value: "defaultObservers", label: "Default observers", description: "Capture built-in runtime observers." },
  {
    value: "autoRegisterErrorHandler",
    label: "Error handler",
    description: "Capture Lua errors before LÖVE shows its handler.",
  },
  { value: "writeToDisk", label: "Write logs to disk", description: "Persist .featherlog files." },
  { value: "debugger", label: "Step debugger", description: "Enable debugger commands by default." },
  { value: "captureScreenshot", label: "Error screenshots", description: "Capture screenshots on errors." },
  { value: "assetPreview", label: "Asset previews", description: "Track loaded assets for the Assets tab." },
];

export const numberPhases = new Set<Phase>([
  "port",
  "sampleRate",
  "updateInterval",
  "maxTempLogs",
  "retryInterval",
  "connectTimeout",
  "errorWait",
  "binaryTextThreshold",
]);

export const textPromptTitles: Partial<Record<Phase, string>> = {
  installDir: "Install directory",
  branch: "GitHub branch or tag",
  sessionName: "Session name shown in Feather",
  host: "Desktop host",
  port: "Desktop WebSocket port",
  baseDir: "Base directory for file links",
  sampleRate: "Sample rate in seconds",
  updateInterval: "Update interval in seconds",
  maxTempLogs: "Max temporary logs",
  outputDir: "Output directory for logs",
  retryInterval: "Reconnect interval in seconds",
  connectTimeout: "Connect timeout in seconds",
  errorWait: "Error delivery wait in seconds",
  binaryTextThreshold: "Binary text threshold in bytes",
  deviceId: "Device ID override",
  capabilities: 'Capabilities ("all" or comma-separated)',
};

export const isStrongApiKey = (value: string) => {
  if (value.length < 16) return false;
  if (/^(password|secret|changeme|dev|test|console|apikey)$/i.test(value)) return false;

  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;

  return classes >= 3 || value.length >= 24;
};

export const numericValue = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseCapabilities = (value: string): string[] | "all" => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return "all";
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};
