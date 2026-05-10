import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createConnection } from "node:net";
import chalk from "chalk";
import { findLoveBinary, getLoveVersion } from "../lib/love.js";

function check(label: string, ok: boolean, detail?: string): void {
  const icon = ok ? chalk.green("✔") : chalk.red("✖");
  const text = ok ? chalk.white(label) : chalk.dim(label);
  console.log(`  ${icon} ${text}${detail ? chalk.dim("  " + detail) : ""}`);
}

function portReachable(port: number, host = "127.0.0.1", timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeout);
    sock.once("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function doctorCommand(gamePath?: string): Promise<void> {
  console.log(chalk.bold("\nFeather environment check\n"));

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split(".").map(Number);
  check("Node.js >= 18", major >= 18, `v${nodeVersion}`);

  // love2d
  let lovePath: string | null = null;
  try {
    lovePath = findLoveBinary();
    const ver = getLoveVersion(lovePath);
    check("love2d found", true, `${lovePath}  (${ver})`);
  } catch {
    check("love2d found", false, "install from https://love2d.org or set LOVE_BIN");
  }

  // Project checks (if gamePath given or cwd has main.lua)
  const projectDir = gamePath ? resolve(gamePath) : process.cwd();
  const hasMain = existsSync(join(projectDir, "main.lua"));
  check("love2d project (main.lua)", hasMain, hasMain ? projectDir : "no main.lua found");

  if (hasMain) {
    const hasFeather = existsSync(join(projectDir, "feather", "init.lua"));
    check(
      "feather library installed",
      hasFeather,
      hasFeather ? join(projectDir, "feather") : "run: feather init"
    );

    const pluginsPath = join(projectDir, "feather", "plugins");
    const legacyPluginsPath = join(projectDir, "plugins");
    const hasPlugins = existsSync(pluginsPath) || existsSync(legacyPluginsPath);
    check("plugins directory", hasPlugins, hasPlugins ? (existsSync(pluginsPath) ? pluginsPath : legacyPluginsPath) : "optional");

    const hasConfig = existsSync(join(projectDir, "feather.config.lua"));
    check("feather.config.lua", hasConfig, hasConfig ? "" : "optional");
  }

  // Desktop app (port 4004)
  const desktopUp = await portReachable(4004);
  check(
    "Feather desktop app (port 4004)",
    desktopUp,
    desktopUp ? "connected" : "start the Feather desktop app"
  );

  console.log();
}
