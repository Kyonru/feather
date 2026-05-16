import React, { useMemo, useState } from "react";
import { Text, render, useApp } from "ink";
import { pluginCatalog } from "../generated/plugin-catalog.js";
import { SelectStep, MultiSelectStep, TextInputStep, BooleanStep } from "./components.js";

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
  initialAction?: PluginAction;
  defaultSelectAll?: boolean;
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

function PluginWorkflow({
  installedIds,
  defaultBranch,
  initialAction,
  defaultSelectAll,
  onComplete,
}: PluginWorkflowInput & { onComplete: (result: PluginWorkflowResult) => void }) {
  const { exit } = useApp();
  const initialPhase: Phase = initialAction === "install" || initialAction === "update" ? "source" : "action";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [action, setAction] = useState<PluginAction>(initialAction ?? "install");
  const [source, setSource] = useState<PluginSource>("local");
  const [branch, setBranch] = useState(defaultBranch);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    defaultSelectAll && initialAction === "update" ? installedIds : [],
  );

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

  const cancel = () => finish({ action: "cancel" });

  if (phase === "action") {
    return (
      <SelectStep
        label="Plugin workflow"
        options={actions.map((a) => a.value)}
        labels={actions.map((a) => a.label)}
        descriptions={actions.map((a) => a.description ?? "")}
        initialIndex={initialAction ? Math.max(0, actions.findIndex((a) => a.value === initialAction)) : 0}
        onSelect={(value) => {
          const act = value as PluginAction;
          setAction(act);
          if (act === "list" || act === "cancel") {
            finish({ action: act });
          } else if (act === "install" || act === "update") {
            setPhase("source");
          } else {
            setPhase("plugins");
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (phase === "source") {
    return (
      <SelectStep
        label="Install/update source"
        options={sources.map((s) => s.value)}
        labels={sources.map((s) => s.label)}
        descriptions={sources.map((s) => s.description ?? "")}
        onSelect={(value) => {
          setSource(value as PluginSource);
          setPhase("plugins");
        }}
        onCancel={cancel}
      />
    );
  }

  if (phase === "branch") {
    return (
      <TextInputStep
        label="GitHub branch or tag"
        defaultValue={branch}
        onSubmit={(value) => {
          setBranch(value || "main");
          setPhase("confirm");
        }}
      />
    );
  }

  if (phase === "plugins") {
    const allSelected = defaultSelectAll && action === "update";
    const pluginTitle =
      action === "install" ? "Choose plugins to install"
      : action === "update" ? "Choose plugins to update"
      : "Choose plugins to remove";
    return (
      <MultiSelectStep
        label={pluginTitle}
        options={pluginOptions.map((p) => p.value)}
        labels={pluginOptions.map((p) => p.label)}
        descriptions={pluginOptions.map((p) => p.description ?? "")}
        initialSelected={allSelected ? undefined : new Set<number>()}
        onSubmit={(chosen) => {
          setSelectedIds(chosen);
          if (action === "remove") {
            setPhase("confirm");
          } else if (source === "remote") {
            setPhase("branch");
          } else {
            setPhase("confirm");
          }
        }}
        onCancel={cancel}
      />
    );
  }

  const rows = selectedIds.length > 0 ? selectedIds : ["No plugins selected."];
  return (
    <BooleanStep
      label={`Run ${action}?`}
      onConfirm={() => {
        if (action === "remove") {
          finish({ action, pluginIds: selectedIds });
        } else if (action === "install" || action === "update") {
          finish({ action, pluginIds: selectedIds, source, branch: branch.trim() || "main" });
        } else {
          finish({ action: "cancel" });
        }
      }}
      onCancel={cancel}
    >
      {rows.map((row) => (
        <Text key={row} dimColor>
          {"  - "}
          {row}
        </Text>
      ))}
    </BooleanStep>
  );
}

export async function choosePluginWorkflow(input: PluginWorkflowInput): Promise<PluginWorkflowResult> {
  return new Promise((resolve) => {
    render(<PluginWorkflow {...input} onComplete={resolve} />);
  });
}

export async function choosePluginUpdateWorkflow(input: {
  installedIds: string[];
  defaultBranch: string;
}): Promise<PluginWorkflowResult> {
  return choosePluginWorkflow({
    ...input,
    initialAction: "update",
    defaultSelectAll: true,
  });
}
