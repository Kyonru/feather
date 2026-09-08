import { spawnSync } from "node:child_process";

type ClipboardCommand = {
  command: string;
  args: string[];
};

function commandsForPlatform(): ClipboardCommand[] {
  if (process.platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }

  if (process.platform === "win32") {
    return [{ command: "clip", args: [] }];
  }

  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

export function copyToClipboard(value: string): boolean {
  for (const { command, args } of commandsForPlatform()) {
    const result = spawnSync(command, args, {
      input: value,
      stdio: ["pipe", "ignore", "ignore"],
    });

    if (!result.error && result.status === 0) {
      return true;
    }
  }

  return false;
}
