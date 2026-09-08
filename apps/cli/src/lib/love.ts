import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

const CANDIDATES: Record<string, string[]> = {
  darwin: ["/Applications/love.app/Contents/MacOS/love"],
  win32: [
    `${process.env["PROGRAMFILES"] ?? "C:\\Program Files"}\\LOVE\\love.exe`,
    `${process.env["LOCALAPPDATA"] ?? ""}\\LOVE\\love.exe`,
  ],
  linux: [],
};

function fromPath(name: string): string | null {
  try {
    const result = execSync(`which ${name} 2>/dev/null`, { encoding: "utf8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function findLoveBinary(override?: string): string {
  if (override) {
    if (!existsSync(override)) throw new Error(`love binary not found at: ${override}`);
    return override;
  }

  if (process.env["LOVE_BIN"]) {
    if (!existsSync(process.env["LOVE_BIN"]))
      throw new Error(`LOVE_BIN points to missing file: ${process.env["LOVE_BIN"]}`);
    return process.env["LOVE_BIN"];
  }

  const os = platform();
  for (const candidate of CANDIDATES[os] ?? []) {
    if (existsSync(candidate)) return candidate;
  }

  // Fall back to PATH
  const fromPathResult = fromPath("love") ?? fromPath("love2d");
  if (fromPathResult) return fromPathResult;

  throw new Error(
    "love2d binary not found.\n" +
      "  Install from https://love2d.org or set LOVE_BIN env var / use --love <path>."
  );
}

export function getLoveVersion(binary: string): string {
  try {
    const out = execSync(`"${binary}" --version 2>&1`, { encoding: "utf8" }).trim();
    const match = out.match(/LOVE\s+([\d.]+)/i);
    return match?.[1] ?? out.split("\n")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
