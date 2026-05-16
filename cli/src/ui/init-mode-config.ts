import {
  dangerousInsecureConnection,
  numericValue,
  parseCapabilities,
  type InitMode,
  type InitSetup,
} from "./init-mode-model.js";

export type InitSetupState = {
  mode: InitMode;
  installSource: "local" | "remote";
  branch: string;
  installDir: string;
  installPlugins: boolean;
  pluginPromptsEnabled: boolean;
  include: Set<string>;
  exclude: Set<string>;
  advanced: boolean;
  sessionName: string;
  host: string;
  port: string;
  socketModeIndex: number;
  baseDir: string;
  sampleRate: string;
  updateInterval: string;
  maxTempLogs: string;
  outputDir: string;
  retryInterval: string;
  connectTimeout: string;
  errorWait: string;
  binaryTextThreshold: string;
  deviceId: string;
  capabilities: string;
  toggles: Set<string>;
  needsApiKey: boolean;
  apiKey: string;
  appIdInput: string;
};

export function buildInitSetup(input: InitSetupState): InitSetup {
  const config: Record<string, unknown> = {};
  if (input.sessionName.trim()) config.sessionName = input.sessionName.trim();
  if (input.pluginPromptsEnabled && input.include.size > 0) config.include = [...input.include];
  if (input.pluginPromptsEnabled && input.exclude.size > 0) config.exclude = [...input.exclude];

  if (input.advanced) {
    config.debug = input.toggles.has("debug");
    config.host = input.host.trim() || "127.0.0.1";
    config.port = numericValue(input.port, 4004);
    config.mode = input.socketModeIndex === 0 ? "socket" : "disk";
    if (input.baseDir.trim()) config.baseDir = input.baseDir.trim();
    config.wrapPrint = input.toggles.has("wrapPrint");
    config.maxTempLogs = numericValue(input.maxTempLogs, 200);
    config.sampleRate = numericValue(input.sampleRate, 1);
    config.updateInterval = numericValue(input.updateInterval, 0.1);
    config.defaultObservers = input.toggles.has("defaultObservers");
    config.errorWait = numericValue(input.errorWait, 3);
    config.autoRegisterErrorHandler = input.toggles.has("autoRegisterErrorHandler");
    config.captureScreenshot = input.toggles.has("captureScreenshot");
    config.writeToDisk = input.toggles.has("writeToDisk");
    config.outputDir = input.outputDir.trim() || "logs";
    config.capabilities = parseCapabilities(input.capabilities);
    config.retryInterval = numericValue(input.retryInterval, 5);
    config.connectTimeout = numericValue(input.connectTimeout, 2);
    config.debugger = input.toggles.has("debugger");
    config.assetPreview = input.toggles.has("assetPreview");
    config.binaryTextThreshold = numericValue(input.binaryTextThreshold, 4096);
    if (input.deviceId.trim()) config.deviceId = input.deviceId.trim();
  }

  if (input.needsApiKey) {
    config.apiKey = input.apiKey;
    config.pluginOptions = {
      console: { evalEnabled: true },
    };
  }

  if (input.appIdInput.trim()) {
    config.appId = input.appIdInput.trim();
  } else {
    config[dangerousInsecureConnection] = true;
  }

  return {
    mode: input.mode,
    source: input.installSource,
    branch: input.branch.trim() || "main",
    installDir: input.installDir.trim() || "feather",
    installPlugins: input.installPlugins,
    config,
    exclude: input.pluginPromptsEnabled ? [...input.exclude] : [],
  };
}
