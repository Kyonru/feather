import React, { useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";

export type UpdateSource = "local" | "remote";

export type CoreUpdateWorkflowResult =
  | { cancelled: true }
  | { cancelled: false; source: UpdateSource; branch: string };

type SourceOption = {
  value: UpdateSource;
  label: string;
  description: string;
};

const sources: SourceOption[] = [
  {
    value: "local",
    label: "Bundled/local copy",
    description: "Use the CLI-bundled Lua runtime, or --local-src when provided.",
  },
  {
    value: "remote",
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
  const [sourceCursor, setSourceCursor] = useState(0);
  const [branch, setBranch] = useState(defaultBranch);
  const [confirmed, setConfirmed] = useState(true);

  const source = sources[sourceCursor].value;

  const finish = (result: CoreUpdateWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const move = (delta: number) => {
    setSourceCursor((value) => (value + sources.length + delta) % sources.length);
  };

  useInput((input, key) => {
    if (key.escape) {
      finish({ cancelled: true });
      return;
    }

    if (phase === "source") {
      if (key.upArrow || input === "k") move(-1);
      else if (key.downArrow || input === "j") move(1);
      else if (Number(input) >= 1 && Number(input) <= sources.length) setSourceCursor(Number(input) - 1);
      else if (key.return) setPhase(source === "remote" ? "branch" : "confirm");
      return;
    }

    if (phase === "branch") {
      if (key.return) setPhase("confirm");
      else if (key.backspace || key.delete) setBranch((value) => value.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBranch((value) => value + input);
      return;
    }

    if (input === "y" || key.leftArrow) setConfirmed(true);
    else if (input === "n" || key.rightArrow) setConfirmed(false);
    else if (key.return) {
      if (!confirmed) finish({ cancelled: true });
      else finish({ cancelled: false, source, branch: branch.trim() || "main" });
    }
  });

  if (phase === "source") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Update Feather core from</Text>
        <Box flexDirection="column">
          {sources.map((option, index) => (
            <Box key={option.value} flexDirection="column">
              <Text color={index === sourceCursor ? "cyan" : undefined}>
                {index === sourceCursor ? "›" : " "} {index + 1}. {option.label}
              </Text>
              <Text color="gray">  {option.description}</Text>
            </Box>
          ))}
        </Box>
        <Text color="gray">Use ↑/↓, j/k, 1-{sources.length}, then Enter. Esc cancels.</Text>
      </Box>
    );
  }

  if (phase === "branch") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>GitHub branch or tag</Text>
        <Text color={branch ? "cyan" : "gray"}>{branch || "main"}</Text>
        <Text color="gray">Enter to continue. Backspace edits.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Update Feather core?</Text>
      <Text>Source: {source === "remote" ? `GitHub ${branch.trim() || "main"}` : "bundled/local copy"}</Text>
      <Text>
        <Text color={confirmed ? "cyan" : undefined}>Yes</Text>
        <Text> / </Text>
        <Text color={!confirmed ? "cyan" : undefined}>No</Text>
      </Text>
      <Text color="gray">Use y/n, ←/→, then Enter.</Text>
    </Box>
  );
}

export async function chooseCoreUpdateWorkflow(defaultBranch: string): Promise<CoreUpdateWorkflowResult> {
  return new Promise((resolve) => {
    render(<CoreUpdateWorkflow defaultBranch={defaultBranch} onComplete={resolve} />);
  });
}
