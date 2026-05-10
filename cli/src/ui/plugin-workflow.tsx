import React, { useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { pluginCatalog } from "../generated/plugin-catalog.js";

type PluginAction = "list" | "install" | "remove" | "update" | "cancel";
type PluginSource = "local" | "remote";
type Phase = "action" | "source" | "branch" | "plugins" | "confirm";

export type PluginWorkflowResult =
  | { action: "list" }
  | { action: "cancel" }
  | { action: "install" | "update"; pluginIds: string[]; source: PluginSource; branch: string }
  | { action: "remove"; pluginIds: string[] };

type Option<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

type PluginWorkflowInput = {
  installedIds: string[];
  defaultBranch: string;
};

const actions: Option<PluginAction>[] = [
  { value: "list", label: "List installed", description: "Show plugins installed in this project." },
  { value: "install", label: "Install plugins", description: "Choose plugins from the catalog." },
  { value: "remove", label: "Remove plugins", description: "Delete installed plugin folders." },
  { value: "update", label: "Update plugins", description: "Refresh selected installed plugins." },
  { value: "cancel", label: "Cancel", description: "Leave plugins unchanged." },
];

const sources: Option<PluginSource>[] = [
  { value: "local", label: "Bundled/local copy", description: "Use the CLI-bundled Lua runtime, or repo src-lua in development." },
  { value: "remote", label: "GitHub download", description: "Fetch plugin files from GitHub using a branch or tag." },
];

const pluginInfo = new Map(pluginCatalog.map((plugin) => [plugin.id, plugin]));

function pluginOption(id: string): Option {
  const plugin = pluginInfo.get(id);
  return {
    value: id,
    label: plugin ? plugin.name : id,
    description: plugin ? `${id} · ${plugin.description}` : id,
  };
}

function SingleSelect<T extends string>({
  title,
  options,
  cursor,
}: {
  title: string;
  options: Option<T>[];
  cursor: number;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.map((option, index) => (
          <Box key={option.value} flexDirection="column">
            <Text color={index === cursor ? "cyan" : undefined}>
              {index === cursor ? "›" : " "} {index + 1}. {option.label}
            </Text>
            {option.description ? <Text color="gray">  {option.description}</Text> : null}
          </Box>
        ))}
      </Box>
      <Text color="gray">Use ↑/↓, j/k, 1-{options.length}, then Enter.</Text>
    </Box>
  );
}

function MultiSelect({
  title,
  options,
  selected,
  cursor,
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  cursor: number;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.length === 0 ? <Text color="gray">Nothing to choose here.</Text> : null}
        {options.map((option, index) => (
          <Box key={option.value} flexDirection="column">
            <Text color={index === cursor ? "cyan" : undefined}>
              {index === cursor ? "›" : " "} {selected.has(option.value) ? "●" : "○"} {option.label}
            </Text>
            {option.description ? <Text color="gray">  {option.description}</Text> : null}
          </Box>
        ))}
      </Box>
      <Text color="gray">Space toggles, Enter continues.</Text>
    </Box>
  );
}

function TextInput({ title, value, placeholder }: { title: string; value: string; placeholder?: string }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text color={value ? "cyan" : "gray"}>{value || placeholder || " "}</Text>
      <Text color="gray">Enter to continue. Backspace edits.</Text>
    </Box>
  );
}

function Confirm({
  title,
  rows,
  yes,
}: {
  title: string;
  rows: string[];
  yes: boolean;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {rows.map((row) => (
          <Text key={row}>{row}</Text>
        ))}
      </Box>
      <Text>
        <Text color={yes ? "cyan" : undefined}>Yes</Text>
        <Text> / </Text>
        <Text color={!yes ? "cyan" : undefined}>No</Text>
      </Text>
      <Text color="gray">Use y/n, ←/→, then Enter.</Text>
    </Box>
  );
}

function PluginWorkflow({ installedIds, defaultBranch, onComplete }: PluginWorkflowInput & { onComplete: (result: PluginWorkflowResult) => void }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("action");
  const [actionCursor, setActionCursor] = useState(0);
  const [sourceCursor, setSourceCursor] = useState(0);
  const [pluginCursor, setPluginCursor] = useState(0);
  const [branch, setBranch] = useState(defaultBranch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(true);

  const action = actions[actionCursor].value;
  const source = sources[sourceCursor].value;
  const installed = useMemo(() => new Set(installedIds), [installedIds]);

  const pluginOptions = useMemo(() => {
    if (action === "install") {
      return pluginCatalog.map((plugin) => plugin.id).filter((id) => !installed.has(id)).map(pluginOption);
    }
    if (action === "remove" || action === "update") {
      return installedIds.map(pluginOption);
    }
    return [];
  }, [action, installed, installedIds]);

  const finish = (result: PluginWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const move = (delta: number, count: number, setter: (value: number | ((value: number) => number)) => void) => {
    if (count <= 0) return;
    setter((value: number) => (value + count + delta) % count);
  };

  const completeSelection = () => {
    if (action === "remove") {
      setPhase("confirm");
      return;
    }
    if (action === "install" || action === "update") {
      if (source === "remote") {
        setPhase("branch");
      } else {
        setPhase("confirm");
      }
      return;
    }
    finish({ action: "cancel" });
  };

  useInput((input, key) => {
    if (key.escape) {
      finish({ action: "cancel" });
      return;
    }

    if (phase === "action") {
      if (key.upArrow || input === "k") move(-1, actions.length, setActionCursor);
      else if (key.downArrow || input === "j") move(1, actions.length, setActionCursor);
      else if (Number(input) >= 1 && Number(input) <= actions.length) setActionCursor(Number(input) - 1);
      else if (key.return) {
        const next = actions[actionCursor].value;
        setSelected(new Set());
        setPluginCursor(0);
        if (next === "list" || next === "cancel") finish({ action: next });
        else if (next === "install" || next === "update") setPhase("source");
        else setPhase("plugins");
      }
      return;
    }

    if (phase === "source") {
      if (key.upArrow || input === "k") move(-1, sources.length, setSourceCursor);
      else if (key.downArrow || input === "j") move(1, sources.length, setSourceCursor);
      else if (Number(input) >= 1 && Number(input) <= sources.length) setSourceCursor(Number(input) - 1);
      else if (key.return) setPhase("plugins");
      return;
    }

    if (phase === "plugins") {
      if (key.upArrow || input === "k") move(-1, pluginOptions.length, setPluginCursor);
      else if (key.downArrow || input === "j") move(1, pluginOptions.length, setPluginCursor);
      else if (input === "a") setSelected(new Set(pluginOptions.map((option) => option.value)));
      else if (input === " ") {
        const option = pluginOptions[pluginCursor];
        if (!option) return;
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(option.value)) next.delete(option.value);
          else next.add(option.value);
          return next;
        });
      } else if (key.return) completeSelection();
      return;
    }

    if (phase === "branch") {
      if (key.return) setPhase("confirm");
      else if (key.backspace || key.delete) setBranch((value) => value.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBranch((value) => value + input);
      return;
    }

    if (phase === "confirm") {
      if (input === "y" || key.leftArrow) setConfirmed(true);
      else if (input === "n" || key.rightArrow) setConfirmed(false);
      else if (key.return) {
        if (!confirmed) {
          finish({ action: "cancel" });
          return;
        }
        const pluginIds = [...selected];
        if (action === "remove") finish({ action, pluginIds });
        else if (action === "install" || action === "update") finish({ action, pluginIds, source, branch: branch.trim() || "main" });
        else finish({ action: "cancel" });
      }
    }
  });

  if (phase === "action") return <SingleSelect title="Plugin workflow" options={actions} cursor={actionCursor} />;
  if (phase === "source") return <SingleSelect title="Install/update source" options={sources} cursor={sourceCursor} />;
  if (phase === "branch") return <TextInput title="GitHub branch or tag" value={branch} placeholder="main" />;
  if (phase === "plugins") {
    return (
      <MultiSelect
        title={action === "install" ? "Choose plugins to install" : action === "update" ? "Choose plugins to update" : "Choose plugins to remove"}
        options={pluginOptions}
        selected={selected}
        cursor={pluginCursor}
      />
    );
  }

  const rows = selected.size > 0 ? [...selected].map((id) => `- ${id}`) : ["No plugins selected."];
  return <Confirm title={`Run ${action}?`} rows={rows} yes={confirmed} />;
}

export async function choosePluginWorkflow(input: PluginWorkflowInput): Promise<PluginWorkflowResult> {
  return new Promise((resolve) => {
    render(<PluginWorkflow {...input} onComplete={resolve} />);
  });
}
