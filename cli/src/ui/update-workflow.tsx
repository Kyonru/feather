import React, { useState } from "react";
import { render, useApp } from "ink";
import { SelectStep, TextInputStep, BooleanStep } from "./components.js";

export type UpdateSource = "local" | "remote";

export type CoreUpdateWorkflowResult =
  | { cancelled: true }
  | { cancelled: false; source: UpdateSource; branch: string };

const sources = [
  {
    value: "local" as UpdateSource,
    label: "Bundled/local copy",
    description: "Use the CLI-bundled Lua runtime, or --local-src when provided.",
  },
  {
    value: "remote" as UpdateSource,
    label: "GitHub download",
    description: "Download core files from GitHub using a branch or tag.",
  },
];

function CoreUpdateWorkflow({
  defaultBranch,
  onComplete,
}: {
  defaultBranch: string;
  onComplete: (result: CoreUpdateWorkflowResult) => void;
}) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<"source" | "branch" | "confirm">("source");
  const [source, setSource] = useState<UpdateSource>("local");
  const [branch, setBranch] = useState(defaultBranch);

  const finish = (result: CoreUpdateWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const cancel = () => finish({ cancelled: true });

  if (phase === "source") {
    return (
      <SelectStep
        label="Update Feather core from"
        options={sources.map((s) => s.value)}
        labels={sources.map((s) => s.label)}
        descriptions={sources.map((s) => s.description)}
        onSelect={(value) => {
          setSource(value as UpdateSource);
          setPhase(value === "remote" ? "branch" : "confirm");
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

  return (
    <BooleanStep
      label="Update Feather core?"
      hint={`Source: ${source === "remote" ? `GitHub ${branch.trim() || "main"}` : "bundled/local copy"}`}
      onConfirm={() => finish({ cancelled: false, source, branch: branch.trim() || "main" })}
      onCancel={cancel}
    />
  );
}

export async function chooseCoreUpdateWorkflow(defaultBranch: string): Promise<CoreUpdateWorkflowResult> {
  return new Promise((resolve) => {
    render(<CoreUpdateWorkflow defaultBranch={defaultBranch} onComplete={resolve} />);
  });
}
