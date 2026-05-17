import { useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { copyToClipboard } from "../../lib/clipboard.js";
import { buildInitSetup } from "./config.js";
import {
  configToggles,
  dangerousInsecureConnection,
  defaultSkippedPlugins,
  installSources,
  isStrongApiKey,
  modes,
  numberPhases,
  optionalPlugins,
  pluginTone,
  skipPluginOptions,
  textPromptTitles,
  toggleTone,
  type InitMode,
  type InitSetup,
  type Phase,
  type SummaryRow,
} from "./model.js";
import {
  ConfirmPrompt,
  DangerousName,
  InfoPanel,
  MultiSelect,
  NameList,
  SingleSelect,
  SummaryRows,
  TextInputPrompt,
} from "./prompts.js";
import { buildInitSummaryRows } from "./summary.js";

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
    onComplete(buildInitSetup({
      mode,
      installSource,
      branch,
      installDir,
      installPlugins,
      pluginPromptsEnabled,
      include,
      exclude,
      advanced,
      sessionName,
      host,
      port,
      socketModeIndex,
      baseDir,
      sampleRate,
      updateInterval,
      maxTempLogs,
      outputDir,
      retryInterval,
      connectTimeout,
      errorWait,
      binaryTextThreshold,
      deviceId,
      capabilities,
      toggles,
      needsApiKey,
      apiKey,
      appIdInput,
    }));
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

  const summary = useMemo<SummaryRow[]>(() => buildInitSummaryRows({
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
  }), [
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
  defaultMode: InitMode = "cli",
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
