import React, { type ReactNode, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { copyToClipboard } from "../lib/clipboard.js";
import { pluginCatalog } from "../generated/plugin-catalog.js";

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

type Phase =
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

type Option<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

type Tone = "info" | "success" | "warning" | "danger";

type SummaryRow = {
  id: string;
  label: string;
  value: ReactNode;
  tone?: Tone;
};

const dangerousInsecureConnection = "__DANGEROUS_INSECURE_CONNECTION__";
const dangerousPluginIds = new Set(["console", "hot-reload"]);
const dangerousToggleIds = new Set(["debugger", "captureScreenshot"]);
const warningToggleIds = new Set(["autoRegisterErrorHandler", "writeToDisk"]);

const toneColor = (tone?: Tone) => {
  if (tone === "danger") return "red";
  if (tone === "warning") return "yellow";
  if (tone === "success") return "green";
  if (tone === "info") return "cyan";
  return undefined;
};

const pluginTone = (value: string): Tone | undefined => (dangerousPluginIds.has(value) ? "danger" : undefined);
const toggleTone = (value: string): Tone | undefined => {
  if (dangerousToggleIds.has(value)) return "danger";
  if (warningToggleIds.has(value)) return "warning";
  return undefined;
};

const modes: Option<InitMode>[] = [
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

const installSources: Option<"local" | "remote">[] = [
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

const optionalPlugins: Option[] = pluginCatalog.filter((plugin) => plugin.optIn).map(pluginToOption);
const skipPluginOptions: Option[] = pluginCatalog.map(pluginToOption);
const defaultSkippedPlugins = new Set(["console", "hot-reload", "hump.signal", "lua-state-machine"]);

const configToggles: Option[] = [
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

const numberPhases = new Set<Phase>([
  "port",
  "sampleRate",
  "updateInterval",
  "maxTempLogs",
  "retryInterval",
  "connectTimeout",
  "errorWait",
  "binaryTextThreshold",
]);

const textPromptTitles: Partial<Record<Phase, string>> = {
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

const isStrongApiKey = (value: string) => {
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

const numericValue = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCapabilities = (value: string): string[] | "all" => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return "all";
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

function DangerousName({ children }: { children: string }) {
  return (
    <Text color="red" bold>
      {children}
    </Text>
  );
}

function NameList({
  values,
  getTone,
}: {
  values: string[];
  getTone?: (value: string) => Tone | undefined;
}) {
  if (values.length === 0) return <Text color="gray">(none)</Text>;

  return (
    <>
      {values.map((value, index) => (
        <React.Fragment key={value}>
          {index > 0 ? <Text color="gray">, </Text> : null}
          <Text color={toneColor(getTone?.(value))}>{value}</Text>
        </React.Fragment>
      ))}
    </>
  );
}

function SummaryValue({ value, tone }: { value: ReactNode; tone?: Tone }) {
  if (typeof value === "string") return <Text color={toneColor(tone)}>{value}</Text>;
  return <>{value}</>;
}

function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Text key={row.id}>
          <Text color="gray">{row.label.padEnd(17)}</Text>
          <SummaryValue value={row.value} tone={row.tone} />
        </Text>
      ))}
    </Box>
  );
}

function InfoPanel({
  title,
  tone = "info",
  children,
}: {
  title: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Text color={toneColor(tone)} bold>
        {title}
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

function cursorLine(active: boolean, text: string, description?: string, tone?: Tone) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={active ? "cyan" : undefined}>{active ? "❯" : " "}</Text>{" "}
        <Text color={toneColor(tone) ?? (active ? "cyan" : undefined)}>{text}</Text>
      </Text>
      {description ? <Text color="gray">  {description}</Text> : null}
    </Box>
  );
}

function TextInputPrompt({
  title,
  value,
  placeholder,
  secure,
  error,
}: {
  title: string;
  value: string;
  placeholder?: string;
  secure?: boolean;
  error?: string;
}) {
  const shown = secure && value ? "•".repeat(value.length) : value;
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text>
        <Text color={value ? "cyan" : "gray"}>{shown || placeholder || " "}</Text>
      </Text>
      {error ? <Text color="red">{error}</Text> : <Text color="gray">←→ move · Backspace delete · Enter confirm</Text>}
    </Box>
  );
}

function SingleSelect<T extends string>({
  title,
  options,
  selected,
  getTone,
}: {
  title: string;
  options: Option<T>[];
  selected: number;
  getTone?: (option: Option<T>) => Tone | undefined;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.map((option, index) => (
          <Box key={option.value}>
            {cursorLine(index === selected, `${index + 1}. ${option.label}`, option.description, getTone?.(option))}
          </Box>
        ))}
      </Box>
      <Text color="gray">↑↓ or j/k navigate · 1-{options.length} jump · Enter select</Text>
    </Box>
  );
}

function MultiSelect({
  title,
  options,
  selected,
  cursor,
  getTone,
  hint = "↑↓ or j/k navigate · Space toggle · a select all · Enter confirm",
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  cursor: number;
  getTone?: (option: Option) => Tone | undefined;
  hint?: string;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.length === 0 ? <Text color="gray">No options available.</Text> : null}
        {options.map((option, index) => {
          const tone = getTone?.(option);
          return (
            <Box key={option.value} flexDirection="column">
              <Text>
                <Text color={index === cursor ? "cyan" : undefined}>
                  {index === cursor ? "❯" : " "} {selected.has(option.value) ? "◉" : "○"}
                </Text>{" "}
                <Text color={toneColor(tone) ?? (index === cursor ? "cyan" : undefined)}>{option.label}</Text>
              </Text>
              {option.description ? <Text color="gray">  {option.description}</Text> : null}
            </Box>
          );
        })}
      </Box>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}

function ConfirmPrompt({ title, value }: { title: string; value: boolean }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text>
        <Text color={value ? "cyan" : undefined}>Yes</Text>
        <Text> / </Text>
        <Text color={!value ? "cyan" : undefined}>No</Text>
      </Text>
      <Text color="gray">y/← = yes · n/→ = no · Enter confirm</Text>
    </Box>
  );
}

function InitSetupPrompt({
  defaultMode,
  defaultName,
  defaultBranch,
  defaultInstallDir,
  onComplete,
}: {
  defaultMode: InitMode;
  defaultName: string;
  defaultBranch: string;
  defaultInstallDir: string;
  onComplete: (setup: InitSetup) => void;
}) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("mode");
  const [modeIndex, setModeIndex] = useState(Math.max(0, modes.findIndex((mode) => mode.value === defaultMode)));
  const [sourceIndex, setSourceIndex] = useState(0);
  const [installDir, setInstallDir] = useState(defaultInstallDir);
  const [branch, setBranch] = useState(defaultBranch);
  const [sessionName, setSessionName] = useState(defaultName);
  const [installPlugins, setInstallPlugins] = useState(true);
  const [includeCursor, setIncludeCursor] = useState(0);
  const [excludeCursor, setExcludeCursor] = useState(0);
  const [toggleCursor, setToggleCursor] = useState(0);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [exclude, setExclude] = useState<Set<string>>(new Set(defaultSkippedPlugins));
  const [advanced, setAdvanced] = useState(false);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("4004");
  const [baseDir, setBaseDir] = useState("");
  const [sampleRate, setSampleRate] = useState("1");
  const [updateInterval, setUpdateInterval] = useState("0.1");
  const [maxTempLogs, setMaxTempLogs] = useState("200");
  const [outputDir, setOutputDir] = useState("logs");
  const [retryInterval, setRetryInterval] = useState("5");
  const [connectTimeout, setConnectTimeout] = useState("2");
  const [errorWait, setErrorWait] = useState("3");
  const [binaryTextThreshold, setBinaryTextThreshold] = useState("4096");
  const [deviceId, setDeviceId] = useState("");
  const [capabilities, setCapabilities] = useState("all");
  const [socketModeIndex, setSocketModeIndex] = useState(0);
  const [toggles, setToggles] = useState<Set<string>>(
    new Set(["debug", "wrapPrint", "defaultObservers", "autoRegisterErrorHandler", "writeToDisk", "assetPreview"]),
  );
  const [apiKey, setApiKey] = useState("");
  const [apiKeyCopied, setApiKeyCopied] = useState<boolean | null>(null);
  const [appIdInput, setAppIdInput] = useState("");
  const [error, setError] = useState<string | undefined>();

  const mode = modes[modeIndex].value;
  const installSource = installSources[sourceIndex].value;
  const installsFiles = mode !== "cli";
  const pluginPromptsEnabled = mode === "cli" || installPlugins;
  const needsApiKey = pluginPromptsEnabled && include.has("console");

  const textValues: Record<string, [string, (value: string) => void]> = {
    installDir: [installDir, setInstallDir],
    branch: [branch, setBranch],
    sessionName: [sessionName, setSessionName],
    host: [host, setHost],
    port: [port, setPort],
    baseDir: [baseDir, setBaseDir],
    sampleRate: [sampleRate, setSampleRate],
    updateInterval: [updateInterval, setUpdateInterval],
    maxTempLogs: [maxTempLogs, setMaxTempLogs],
    outputDir: [outputDir, setOutputDir],
    retryInterval: [retryInterval, setRetryInterval],
    connectTimeout: [connectTimeout, setConnectTimeout],
    errorWait: [errorWait, setErrorWait],
    binaryTextThreshold: [binaryTextThreshold, setBinaryTextThreshold],
    deviceId: [deviceId, setDeviceId],
    capabilities: [capabilities, setCapabilities],
  };

  const nextAfterPluginChoice = () => setPhase(pluginPromptsEnabled ? "include" : "advanced");
  const nextAfterAdvanced = () => setPhase(advanced ? "host" : needsApiKey ? "apiKey" : "appId");
  const nextAfterToggles = () => setPhase(needsApiKey ? "apiKey" : "appId");

  const finish = () => {
    const config: Record<string, unknown> = {};
    if (sessionName.trim()) config.sessionName = sessionName.trim();
    if (pluginPromptsEnabled && include.size > 0) config.include = [...include];
    if (pluginPromptsEnabled && exclude.size > 0) config.exclude = [...exclude];

    if (advanced) {
      config.debug = toggles.has("debug");
      config.host = host.trim() || "127.0.0.1";
      config.port = numericValue(port, 4004);
      config.mode = socketModeIndex === 0 ? "socket" : "disk";
      if (baseDir.trim()) config.baseDir = baseDir.trim();
      config.wrapPrint = toggles.has("wrapPrint");
      config.maxTempLogs = numericValue(maxTempLogs, 200);
      config.sampleRate = numericValue(sampleRate, 1);
      config.updateInterval = numericValue(updateInterval, 0.1);
      config.defaultObservers = toggles.has("defaultObservers");
      config.errorWait = numericValue(errorWait, 3);
      config.autoRegisterErrorHandler = toggles.has("autoRegisterErrorHandler");
      config.captureScreenshot = toggles.has("captureScreenshot");
      config.writeToDisk = toggles.has("writeToDisk");
      config.outputDir = outputDir.trim() || "logs";
      config.capabilities = parseCapabilities(capabilities);
      config.retryInterval = numericValue(retryInterval, 5);
      config.connectTimeout = numericValue(connectTimeout, 2);
      config.debugger = toggles.has("debugger");
      config.assetPreview = toggles.has("assetPreview");
      config.binaryTextThreshold = numericValue(binaryTextThreshold, 4096);
      if (deviceId.trim()) config.deviceId = deviceId.trim();
    }

    if (needsApiKey) {
      config.apiKey = apiKey;
      config.pluginOptions = {
        console: { evalEnabled: true },
      };
    }

    if (appIdInput.trim()) {
      config.appId = appIdInput.trim();
    } else {
      config.__DANGEROUS_INSECURE_CONNECTION__ = true;
    }

    onComplete({
      mode,
      source: installSource,
      branch: branch.trim() || "main",
      installDir: installDir.trim() || "feather",
      installPlugins,
      config,
      exclude: pluginPromptsEnabled ? [...exclude] : [],
    });
    exit();
  };

  const move = (delta: number, count: number, setter: (value: number | ((value: number) => number)) => void) => {
    if (count <= 0) return;
    setter((value: number) => (value + count + delta) % count);
  };

  const editText = (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1], value: string, setter: (value: string) => void) => {
    if (key.backspace || key.delete) {
      setter(value.slice(0, -1));
      return true;
    }
    if (input && !key.ctrl && !key.meta && !key.return) {
      setter(value + input);
      return true;
    }
    return false;
  };

  const advanceTextPhase = () => {
    const order: Phase[] = [
      "host",
      "port",
      "modeConfig",
      "baseDir",
      "sampleRate",
      "updateInterval",
      "maxTempLogs",
      "outputDir",
      "retryInterval",
      "connectTimeout",
      "errorWait",
      "binaryTextThreshold",
      "deviceId",
      "capabilities",
      "toggles",
    ];
    const index = order.indexOf(phase);
    setPhase(order[index + 1] ?? "summary");
  };

  useInput((input, key) => {
    setError(undefined);

    if (key.escape) {
      exit();
      return;
    }

    if (phase === "mode") {
      if (key.upArrow || input === "k") move(-1, modes.length, setModeIndex);
      else if (key.downArrow || input === "j") move(1, modes.length, setModeIndex);
      else if (Number(input) >= 1 && Number(input) <= modes.length) setModeIndex(Number(input) - 1);
      else if (key.return) setPhase(modes[modeIndex].value === "cli" ? "sessionName" : "installDir");
      return;
    }

    if (phase === "installDir") {
      if (key.return) setPhase("source");
      else editText(input, key, installDir, setInstallDir);
      return;
    }

    if (phase === "source") {
      if (key.upArrow || input === "k") move(-1, installSources.length, setSourceIndex);
      else if (key.downArrow || input === "j") move(1, installSources.length, setSourceIndex);
      else if (Number(input) >= 1 && Number(input) <= installSources.length) setSourceIndex(Number(input) - 1);
      else if (key.return) setPhase(installSources[sourceIndex].value === "remote" ? "branch" : "sessionName");
      return;
    }

    if (phase === "branch") {
      if (key.return) setPhase("sessionName");
      else editText(input, key, branch, setBranch);
      return;
    }

    if (phase === "sessionName") {
      if (key.return) setPhase(installsFiles ? "installPlugins" : "include");
      else editText(input, key, sessionName, setSessionName);
      return;
    }

    if (phase === "installPlugins") {
      if (input === "y" || key.leftArrow) setInstallPlugins(true);
      else if (input === "n" || key.rightArrow) {
        setInstallPlugins(false);
        setInclude(new Set());
        setExclude(new Set());
      } else if (key.return) nextAfterPluginChoice();
      return;
    }

    if (phase === "include") {
      if (key.upArrow || input === "k") move(-1, optionalPlugins.length, setIncludeCursor);
      else if (key.downArrow || input === "j") move(1, optionalPlugins.length, setIncludeCursor);
      else if (input === " " && optionalPlugins[includeCursor]) {
        setInclude((current) => {
          const next = new Set(current);
          const value = optionalPlugins[includeCursor].value;
          if (next.has(value)) {
            next.delete(value);
          } else {
            next.add(value);
            setExclude((currentExclude) => {
              const nextExclude = new Set(currentExclude);
              nextExclude.delete(value);
              return nextExclude;
            });
          }
          return next;
        });
      } else if (key.return) setPhase("exclude");
      return;
    }

    if (phase === "exclude") {
      if (key.upArrow || input === "k") move(-1, skipPluginOptions.length, setExcludeCursor);
      else if (key.downArrow || input === "j") move(1, skipPluginOptions.length, setExcludeCursor);
      else if (input === " " && skipPluginOptions[excludeCursor]) {
        setExclude((current) => {
          const next = new Set(current);
          const value = skipPluginOptions[excludeCursor].value;
          if (next.has(value)) next.delete(value);
          else {
            next.add(value);
            setInclude((currentInclude) => {
              const nextInclude = new Set(currentInclude);
              nextInclude.delete(value);
              return nextInclude;
            });
          }
          return next;
        });
      } else if (key.return) setPhase("advanced");
      return;
    }

    if (phase === "advanced") {
      if (input === "y" || key.leftArrow) setAdvanced(true);
      else if (input === "n" || key.rightArrow) setAdvanced(false);
      else if (key.return) nextAfterAdvanced();
      return;
    }

    if (phase === "modeConfig") {
      if (key.upArrow || input === "k") move(-1, 2, setSocketModeIndex);
      else if (key.downArrow || input === "j") move(1, 2, setSocketModeIndex);
      else if (key.return) advanceTextPhase();
      return;
    }

    if (phase === "toggles") {
      if (key.upArrow || input === "k") move(-1, configToggles.length, setToggleCursor);
      else if (key.downArrow || input === "j") move(1, configToggles.length, setToggleCursor);
      else if (input === " ") {
        setToggles((current) => {
          const next = new Set(current);
          const value = configToggles[toggleCursor].value;
          if (next.has(value)) next.delete(value);
          else next.add(value);
          return next;
        });
      } else if (key.return) nextAfterToggles();
      return;
    }

    if (phase === "apiKey") {
      if (key.return) {
        if (!isStrongApiKey(apiKey)) {
          setError("Use at least 16 chars and mix upper/lowercase, numbers, or symbols.");
          return;
        }
        setApiKeyCopied(copyToClipboard(apiKey));
        setPhase("appId");
      } else {
        editText(input, key, apiKey, setApiKey);
      }
      return;
    }

    if (phase === "appId") {
      if (key.return) {
        setPhase("summary");
      } else {
        editText(input, key, appIdInput, setAppIdInput);
      }
      return;
    }

    if (textValues[phase]) {
      const [value, setter] = textValues[phase];
      if (key.return) advanceTextPhase();
      else if (!numberPhases.has(phase) || /^[\d.]*$/.test(input) || key.backspace || key.delete) {
        editText(input, key, value, setter);
      }
      return;
    }

    if (key.return) finish();
  });

  const summary = useMemo<SummaryRow[]>(() => {
    const includeList = [...include];
    const excludeList = [...exclude];
    const rows: SummaryRow[] = [
      { id: "mode", label: "Mode", value: modes[modeIndex].label },
      {
        id: "install-dir",
        label: "Install dir",
        value: installsFiles ? `${installDir || "feather"}/` : "bundled CLI runtime",
      },
      installsFiles ? { id: "source", label: "Source", value: installSources[sourceIndex].label } : undefined,
      installsFiles && installSource === "remote" ? { id: "branch", label: "Branch", value: branch || "main" } : undefined,
      installsFiles ? { id: "plugins", label: "Install plugins", value: installPlugins ? "yes" : "no" } : undefined,
      { id: "session", label: "Session", value: sessionName || "(default)" },
      pluginPromptsEnabled
        ? { id: "include", label: "Include", value: <NameList values={includeList} getTone={pluginTone} /> }
        : undefined,
      pluginPromptsEnabled
        ? { id: "exclude", label: "Exclude", value: <NameList values={excludeList} getTone={pluginTone} /> }
        : undefined,
      { id: "advanced", label: "Advanced config", value: advanced ? "yes" : "no", tone: advanced ? "warning" : undefined },
    ].filter(Boolean) as SummaryRow[];

    if (needsApiKey) {
      rows.push({
        id: "api-key",
        label: "Console API key",
        value:
          apiKeyCopied === true
            ? "set and copied to clipboard"
            : apiKeyCopied === false
              ? "set (clipboard copy unavailable)"
              : "set",
        tone: "success",
      });
    }
    rows.push(
      appIdInput.trim()
        ? { id: "app-id", label: "App ID", value: appIdInput.trim(), tone: "success" }
        : {
            id: "app-id",
            label: "App ID",
            value: (
              <>
                <Text>not set → </Text>
                <DangerousName>{dangerousInsecureConnection}</DangerousName>
                <Text color="red"> = true</Text>
              </>
            ),
            tone: "danger",
          },
    );
    return rows;
  }, [
    advanced,
    apiKeyCopied,
    appIdInput,
    branch,
    exclude,
    include,
    installDir,
    installPlugins,
    installsFiles,
    installSource,
    modeIndex,
    needsApiKey,
    pluginPromptsEnabled,
    sessionName,
    sourceIndex,
  ]);

  if (phase === "mode") return <SingleSelect title="How should Feather be added to this project?" options={modes} selected={modeIndex} />;
  if (phase === "source") return <SingleSelect title="Where should Feather be installed from?" options={installSources} selected={sourceIndex} />;
  if (phase === "installPlugins") return <ConfirmPrompt title="Install built-in plugins?" value={installPlugins} />;
  if (phase === "include") {
    return (
      <MultiSelect
        title="Force-enable optional plugins?"
        options={optionalPlugins}
        selected={include}
        cursor={includeCursor}
        getTone={(option) => pluginTone(option.value)}
      />
    );
  }
  if (phase === "exclude") {
    return (
      <MultiSelect
        title="Skip plugins? (installer defaults are preselected)"
        options={skipPluginOptions}
        selected={exclude}
        cursor={excludeCursor}
        getTone={(option) => pluginTone(option.value)}
      />
    );
  }
  if (phase === "advanced") return <ConfirmPrompt title="Configure advanced Feather options?" value={advanced} />;
  if (phase === "modeConfig") {
    return (
      <SingleSelect
        title="Connection mode"
        options={[
          { value: "socket", label: "socket" },
          { value: "disk", label: "disk" },
        ]}
        selected={socketModeIndex}
      />
    );
  }
  if (phase === "toggles") {
    return (
      <MultiSelect
        title="Toggle runtime options"
        options={configToggles}
        selected={toggles}
        cursor={toggleCursor}
        getTone={(option) => toggleTone(option.value)}
      />
    );
  }
  if (phase === "apiKey") {
    return <TextInputPrompt title="Console API key" value={apiKey} secure error={error} placeholder="Strong secret, 16+ chars" />;
  }
  if (phase === "appId") {
    return (
      <Box flexDirection="column" gap={1}>
        <TextInputPrompt title="Desktop App ID" value={appIdInput} placeholder="feather-app-xxxxxxxx-…" />
        <InfoPanel title="Where to find it" tone="info">
          <Text color="gray">Feather desktop app → Settings → Security → Desktop App ID.</Text>
        </InfoPanel>
        <InfoPanel title="Leaving this blank" tone="danger">
          <Text>
            Writes <DangerousName>{dangerousInsecureConnection}</DangerousName>
            <Text color="red"> = true</Text> to feather.config.lua.
          </Text>
          <Text color="gray">Use only for trusted local development. Any Feather desktop can connect to the game.</Text>
        </InfoPanel>
      </Box>
    );
  }
  if (textValues[phase]) {
    const [value] = textValues[phase];
    return <TextInputPrompt title={textPromptTitles[phase] ?? "Value"} value={value} placeholder={value || undefined} />;
  }

  const enabledAdvancedOptions = advanced ? configToggles.filter((option) => toggles.has(option.value)).map((option) => option.value) : [];
  const writesRuntimeFiles = mode !== "cli";
  const patchesMainLua = mode === "auto";

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Ready to initialize Feather
      </Text>
      <SummaryRows rows={summary} />
      <InfoPanel title="Files" tone={patchesMainLua ? "warning" : "info"}>
        {writesRuntimeFiles ? (
          <>
            <Text>
              Runtime files will be written under <Text color="cyan">{installDir || "feather"}/</Text>.
            </Text>
            {patchesMainLua ? (
              <Text color="yellow">main.lua will be patched with a USE_DEBUGGER-guarded require.</Text>
            ) : (
              <Text color="gray">feather.debugger.lua will be created for manual loading.</Text>
            )}
          </>
        ) : (
          <Text color="gray">No runtime files will be copied; the CLI runtime is used at launch.</Text>
        )}
      </InfoPanel>
      <InfoPanel title={appIdInput.trim() ? "Connection" : "Connection risk"} tone={appIdInput.trim() ? "success" : "danger"}>
        {appIdInput.trim() ? (
          <Text color="green">Desktop connections are limited to the configured App ID.</Text>
        ) : (
          <>
            <Text>
              <DangerousName>{dangerousInsecureConnection}</DangerousName>
              <Text color="red"> is enabled.</Text>
            </Text>
            <Text color="gray">Any Feather desktop can send commands to this game while it is running.</Text>
          </>
        )}
      </InfoPanel>
      {advanced ? (
        <InfoPanel title="Advanced runtime options" tone="warning">
          <Text>
            Enabled: <NameList values={enabledAdvancedOptions} getTone={toggleTone} />
          </Text>
        </InfoPanel>
      ) : null}
      <Text color="gray">Press Enter to continue.</Text>
    </Box>
  );
}

export async function chooseInitMode(
  defaultMode: InitMode = "auto",
  defaultName = "My Game",
  defaultBranch = "main",
  defaultInstallDir = "feather",
): Promise<InitSetup> {
  return new Promise((resolve) => {
    render(
      <InitSetupPrompt
        defaultMode={defaultMode}
        defaultName={defaultName}
        defaultBranch={defaultBranch}
        defaultInstallDir={defaultInstallDir}
        onComplete={resolve}
      />,
    );
  });
}
