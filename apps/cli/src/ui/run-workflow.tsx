import React, { useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";

export type RunWorkflowResult =
  | { cancelled: true }
  | {
      cancelled: false;
      gamePath: string;
      sessionName?: string;
      config?: string;
      noPlugins?: boolean;
      love?: string;
      featherPath?: string;
      pluginsDir?: string;
      gameArgs?: string[];
    };

type Phase =
  | "gamePath"
  | "sessionName"
  | "config"
  | "noPlugins"
  | "advanced"
  | "love"
  | "featherPath"
  | "pluginsDir"
  | "gameArgs"
  | "confirm";

const phaseTitle: Record<Phase, string> = {
  gamePath: "Game path",
  sessionName: "Session name",
  config: "Config path",
  noPlugins: "Disable plugins?",
  advanced: "Advanced run options?",
  love: "LÖVE binary path",
  featherPath: "Feather runtime path",
  pluginsDir: "Plugins directory",
  gameArgs: "Game arguments",
  confirm: "Run game?",
};

function TextInput({
  title,
  value,
  placeholder,
}: {
  title: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text color={value ? "cyan" : "gray"}>{value || placeholder || " "}</Text>
      <Text color="gray">Enter to continue. Backspace edits. Esc cancels.</Text>
    </Box>
  );
}

function BooleanInput({
  title,
  value,
}: {
  title: string;
  value: boolean;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text>
        <Text color={value ? "cyan" : undefined}>Yes</Text>
        <Text> / </Text>
        <Text color={!value ? "cyan" : undefined}>No</Text>
      </Text>
      <Text color="gray">Use y/n, ←/→, then Enter. Esc cancels.</Text>
    </Box>
  );
}

function RunWorkflow({ onComplete }: { onComplete: (result: RunWorkflowResult) => void }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("gamePath");
  const [gamePath, setGamePath] = useState(".");
  const [sessionName, setSessionName] = useState("");
  const [config, setConfig] = useState("");
  const [noPlugins, setNoPlugins] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [love, setLove] = useState("");
  const [featherPath, setFeatherPath] = useState("");
  const [pluginsDir, setPluginsDir] = useState("");
  const [gameArgs, setGameArgs] = useState("");
  const [confirmed, setConfirmed] = useState(true);

  const textSetters: Partial<Record<Phase, (value: string | ((value: string) => string)) => void>> = {
    gamePath: setGamePath,
    sessionName: setSessionName,
    config: setConfig,
    love: setLove,
    featherPath: setFeatherPath,
    pluginsDir: setPluginsDir,
    gameArgs: setGameArgs,
  };

  const finish = (result: RunWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const next = () => {
    if (phase === "gamePath") setPhase("sessionName");
    else if (phase === "sessionName") setPhase("config");
    else if (phase === "config") setPhase("noPlugins");
    else if (phase === "noPlugins") setPhase("advanced");
    else if (phase === "advanced") setPhase(advanced ? "love" : "confirm");
    else if (phase === "love") setPhase("featherPath");
    else if (phase === "featherPath") setPhase("pluginsDir");
    else if (phase === "pluginsDir") setPhase("gameArgs");
    else if (phase === "gameArgs") setPhase("confirm");
  };

  useInput((input, key) => {
    if (key.escape) {
      finish({ cancelled: true });
      return;
    }

    if (phase === "noPlugins") {
      if (input === "y" || key.leftArrow) setNoPlugins(true);
      else if (input === "n" || key.rightArrow) setNoPlugins(false);
      else if (key.return) next();
      return;
    }

    if (phase === "advanced") {
      if (input === "y" || key.leftArrow) setAdvanced(true);
      else if (input === "n" || key.rightArrow) setAdvanced(false);
      else if (key.return) next();
      return;
    }

    if (phase === "confirm") {
      if (input === "y" || key.leftArrow) setConfirmed(true);
      else if (input === "n" || key.rightArrow) setConfirmed(false);
      else if (key.return) {
        if (!confirmed) {
          finish({ cancelled: true });
          return;
        }
        finish({
          cancelled: false,
          gamePath: gamePath.trim() || ".",
          sessionName: sessionName.trim() || undefined,
          config: config.trim() || undefined,
          noPlugins,
          love: love.trim() || undefined,
          featherPath: featherPath.trim() || undefined,
          pluginsDir: pluginsDir.trim() || undefined,
          gameArgs: gameArgs.trim() ? gameArgs.trim().split(/\s+/) : undefined,
        });
      }
      return;
    }

    const setter = textSetters[phase];
    if (!setter) return;
    if (key.return) next();
    else if (key.backspace || key.delete) setter((value) => value.slice(0, -1));
    else if (input && !key.ctrl && !key.meta) setter((value) => value + input);
  });

  if (phase === "noPlugins") return <BooleanInput title={phaseTitle[phase]} value={noPlugins} />;
  if (phase === "advanced") return <BooleanInput title={phaseTitle[phase]} value={advanced} />;
  if (phase === "confirm") {
    const rows = [
      `Game: ${gamePath.trim() || "."}`,
      sessionName.trim() ? `Session: ${sessionName.trim()}` : undefined,
      config.trim() ? `Config: ${config.trim()}` : undefined,
      noPlugins ? "Plugins: disabled" : "Plugins: enabled",
      love.trim() ? `LÖVE: ${love.trim()}` : undefined,
      featherPath.trim() ? `Feather runtime: ${featherPath.trim()}` : undefined,
      pluginsDir.trim() ? `Plugins dir: ${pluginsDir.trim()}` : undefined,
      gameArgs.trim() ? `Game args: ${gameArgs.trim()}` : undefined,
    ].filter(Boolean);

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{phaseTitle[phase]}</Text>
        <Box flexDirection="column">
          {rows.map((row) => (
            <Text key={row}>{row}</Text>
          ))}
        </Box>
        <Text>
          <Text color={confirmed ? "cyan" : undefined}>Yes</Text>
          <Text> / </Text>
          <Text color={!confirmed ? "cyan" : undefined}>No</Text>
        </Text>
        <Text color="gray">Use y/n, ←/→, then Enter.</Text>
      </Box>
    );
  }

  const values: Record<string, string> = {
    gamePath,
    sessionName,
    config,
    love,
    featherPath,
    pluginsDir,
    gameArgs,
  };

  const placeholders: Partial<Record<Phase, string>> = {
    gamePath: ".",
    sessionName: "Use feather.config.lua or folder name",
    config: "feather.config.lua",
    love: "Auto-detect",
    featherPath: "Bundled/local runtime",
    pluginsDir: "Bundled/local plugins",
    gameArgs: "--level dev",
  };

  return <TextInput title={phaseTitle[phase]} value={values[phase] ?? ""} placeholder={placeholders[phase]} />;
}

export async function chooseRunWorkflow(): Promise<RunWorkflowResult> {
  return new Promise((resolve) => {
    render(<RunWorkflow onComplete={resolve} />);
  });
}
