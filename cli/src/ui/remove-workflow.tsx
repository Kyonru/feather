import React, { useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";

export type RemoveTarget = {
  id: string;
  label: string;
  path: string;
  description: string;
  defaultSelected: boolean;
};

export type RemoveWorkflowResult =
  | { cancelled: true }
  | { cancelled: false; targetIds: string[] };

function RemoveWorkflow({
  targets,
  onComplete,
}: {
  targets: RemoveTarget[];
  onComplete: (result: RemoveWorkflowResult) => void;
}) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [yes, setYes] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(targets.filter((target) => target.defaultSelected).map((target) => target.id)),
  );

  const rows = useMemo(() => targets, [targets]);

  const finish = (result: RemoveWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const move = (delta: number) => {
    if (rows.length === 0) return;
    setCursor((value) => (value + rows.length + delta) % rows.length);
  };

  useInput((input, key) => {
    if (key.escape) {
      finish({ cancelled: true });
      return;
    }

    if (confirm) {
      if (input === "y" || key.leftArrow) setYes(true);
      else if (input === "n" || key.rightArrow) setYes(false);
      else if (key.return) {
        finish(yes ? { cancelled: false, targetIds: [...selected] } : { cancelled: true });
      }
      return;
    }

    if (key.upArrow || input === "k") move(-1);
    else if (key.downArrow || input === "j") move(1);
    else if (input === "a") setSelected(new Set(rows.map((target) => target.id)));
    else if (input === " ") {
      const target = rows[cursor];
      if (!target) return;
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(target.id)) next.delete(target.id);
        else next.add(target.id);
        return next;
      });
    } else if (key.return) {
      setConfirm(true);
    }
  });

  if (confirm) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Remove selected Feather files and markers?</Text>
        <Box flexDirection="column">
          {[...selected].map((id) => {
            const target = rows.find((item) => item.id === id);
            return target ? <Text key={id}>- {target.label}: {target.path}</Text> : null;
          })}
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

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Choose what Feather should remove</Text>
      <Box flexDirection="column">
        {rows.length === 0 ? <Text color="gray">No managed Feather files or markers were found.</Text> : null}
        {rows.map((target, index) => (
          <Box key={target.id} flexDirection="column">
            <Text color={index === cursor ? "cyan" : undefined}>
              {index === cursor ? "›" : " "} {selected.has(target.id) ? "●" : "○"} {target.label}: {target.path}
            </Text>
            <Text color="gray">  {target.description}</Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">Space toggles, a selects all, Enter continues, Esc cancels.</Text>
    </Box>
  );
}

export async function chooseRemoveWorkflow(targets: RemoveTarget[]): Promise<RemoveWorkflowResult> {
  return new Promise((resolve) => {
    render(<RemoveWorkflow targets={targets} onComplete={resolve} />);
  });
}
