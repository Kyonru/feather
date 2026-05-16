import { Text } from "ink";
import {
  dangerousInsecureConnection,
  installSources,
  modes,
  pluginTone,
  type SummaryRow,
} from "./init-mode-model.js";
import { DangerousName, NameList } from "./init-mode-prompts.js";

export type InitSummaryInput = {
  advanced: boolean;
  apiKeyCopied: boolean | null;
  appIdInput: string;
  branch: string;
  exclude: Set<string>;
  include: Set<string>;
  installDir: string;
  installPlugins: boolean;
  installsFiles: boolean;
  installSource: "local" | "remote";
  modeIndex: number;
  needsApiKey: boolean;
  pluginPromptsEnabled: boolean;
  sessionName: string;
  sourceIndex: number;
};

export function buildInitSummaryRows(input: InitSummaryInput): SummaryRow[] {
  const includeList = [...input.include];
  const excludeList = [...input.exclude];
  const rows: SummaryRow[] = [
    { id: "mode", label: "Mode", value: modes[input.modeIndex].label },
    {
      id: "install-dir",
      label: "Install dir",
      value: input.installsFiles ? `${input.installDir || "feather"}/` : "bundled CLI runtime",
    },
    input.installsFiles ? { id: "source", label: "Source", value: installSources[input.sourceIndex].label } : undefined,
    input.installsFiles && input.installSource === "remote" ? { id: "branch", label: "Branch", value: input.branch || "main" } : undefined,
    input.installsFiles ? { id: "plugins", label: "Install plugins", value: input.installPlugins ? "yes" : "no" } : undefined,
    { id: "session", label: "Session", value: input.sessionName || "(default)" },
    input.pluginPromptsEnabled
      ? { id: "include", label: "Include", value: <NameList values={includeList} getTone={pluginTone} /> }
      : undefined,
    input.pluginPromptsEnabled
      ? { id: "exclude", label: "Exclude", value: <NameList values={excludeList} getTone={pluginTone} /> }
      : undefined,
    { id: "advanced", label: "Advanced config", value: input.advanced ? "yes" : "no", tone: input.advanced ? "warning" : undefined },
  ].filter(Boolean) as SummaryRow[];

  if (input.needsApiKey) {
    rows.push({
      id: "api-key",
      label: "Console API key",
      value:
        input.apiKeyCopied === true
          ? "set and copied to clipboard"
          : input.apiKeyCopied === false
            ? "set (clipboard copy unavailable)"
            : "set",
      tone: "success",
    });
  }

  rows.push(
    input.appIdInput.trim()
      ? { id: "app-id", label: "App ID", value: input.appIdInput.trim(), tone: "success" }
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
}
