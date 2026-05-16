import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { BuildArtifact } from '../build/files.js';
import { loadBuildConfig, type BuildTarget, type LoadBuildConfigOptions } from '../build/config.js';
import { runBuild } from '../build/build.js';
import { androidProductId, iosBundleIdentifier } from '../build/validation.js';
import { printMuted } from '../output.js';
import { logNativeCommand, logNativeOutput, type NativeBuildLogger } from '../build/native.js';

export type MobileRunTarget = Extract<BuildTarget, 'android' | 'ios'>;

export type MobileRunOptions = LoadBuildConfigOptions & {
  target: MobileRunTarget;
  device?: string;
  clean?: boolean;
  noCache?: boolean;
  debugger?: boolean;
  runtimeConfigPath?: string;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
  verbose?: boolean;
  adbReverse?: boolean;
  port?: number;
};

export type MobileRunResult = {
  target: MobileRunTarget;
  projectDir: string;
  artifact: string;
  appId: string;
  device: string;
  adbReverse?: boolean;
  port?: number;
};

export function runMobile(options: MobileRunOptions): MobileRunResult {
  const buildResult = runBuild({
    target: options.target,
    projectDir: options.projectDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
    clean: options.clean,
    noCache: options.noCache,
    debugger: options.debugger,
    runtimeConfigPath: options.runtimeConfigPath,
    noPlugins: options.noPlugins,
    featherOverride: options.featherOverride,
    pluginsOverride: options.pluginsOverride,
    allowUnsafe: true,
    verbose: options.verbose,
    log: options.verbose ? printMuted : undefined,
  });

  if (!buildResult.ok) {
    throw new Error(buildResult.error);
  }

  const config = loadBuildConfig({
    projectDir: buildResult.projectDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
  });

  if (options.target === 'android') {
    const apk = requireArtifact(buildResult.artifacts, 'apk', 'Android APK');
    const appId = androidProductId(config);
    installAndLaunchAndroid({
      apk,
      appId,
      device: options.device,
      adbReverse: options.adbReverse !== false,
      port: options.port ?? 4004,
      log: options.verbose ? printMuted : undefined,
    });
    return {
      target: 'android',
      projectDir: buildResult.projectDir,
      artifact: apk,
      appId,
      device: options.device ?? 'default',
      adbReverse: options.adbReverse !== false,
      port: options.port ?? 4004,
    };
  }

  const app = requireArtifact(buildResult.artifacts, 'app', 'iOS app');
  const appId = iosBundleIdentifier(config);
  const device = options.device ?? 'booted';
  installAndLaunchIos({ app, appId, device, log: options.verbose ? printMuted : undefined });
  return {
    target: 'ios',
    projectDir: buildResult.projectDir,
    artifact: app,
    appId,
    device,
  };
}

function requireArtifact(artifacts: BuildArtifact[], type: string, label: string): string {
  const artifact = artifacts.find((item) => item.type === type);
  if (!artifact || !existsSync(artifact.path)) {
    throw new Error(`${label} artifact was not found after build.`);
  }
  return artifact.path;
}

function installAndLaunchAndroid(input: {
  apk: string;
  appId: string;
  device?: string;
  adbReverse: boolean;
  port: number;
  log?: NativeBuildLogger;
}): void {
  runAdb(input.device, ['version'], 'adb not found. Run `feather doctor --build-target android` for setup guidance.', input.log);
  runAdb(input.device, ['install', '-r', input.apk], 'Android install failed.', input.log);
  runAdb(input.device, ['shell', 'am', 'force-stop', input.appId], 'Android force-stop failed.', input.log);
  if (input.adbReverse) {
    runAdb(
      input.device,
      ['reverse', `tcp:${input.port}`, `tcp:${input.port}`],
      'Android adb reverse failed. Check USB debugging or pass --no-adb-reverse.',
      input.log,
    );
  }
  runAdb(
    input.device,
    ['shell', 'monkey', '-p', input.appId, '-c', 'android.intent.category.LAUNCHER', '1'],
    'Android launch failed.',
    input.log,
  );
}

function runAdb(device: string | undefined, args: string[], message: string, log?: NativeBuildLogger): void {
  const fullArgs = device ? ['-s', device, ...args] : args;
  logNativeCommand(log, 'adb', fullArgs, process.cwd());
  const streamOutput = Boolean(log);
  const result = spawnSync('adb', fullArgs, {
    encoding: streamOutput ? undefined : 'utf8',
    stdio: streamOutput ? 'inherit' : 'pipe',
  });
  if (!streamOutput) logNativeOutput(log, result.stdout, result.stderr);
  if (result.error) throw new Error(`${message} ${(result.error as Error).message}`.trim());
  if (result.status !== 0) {
    throw new Error(`${message} ${(result.stderr || result.stdout || `exit code ${result.status ?? 'unknown'}`).toString().trim()}`.trim());
  }
}

function installAndLaunchIos(input: { app: string; appId: string; device: string; log?: NativeBuildLogger }): void {
  runXcrunOptional(['simctl', 'terminate', input.device, input.appId], input.log);
  runXcrunOptional(['simctl', 'uninstall', input.device, input.appId], input.log);
  runXcrun(['simctl', 'install', input.device, input.app], 'iOS simulator install failed.', input.log);
  runXcrun(['simctl', 'launch', input.device, input.appId], 'iOS simulator launch failed.', input.log);
}

function runXcrunOptional(args: string[], log?: NativeBuildLogger): void {
  logNativeCommand(log, 'xcrun', args, process.cwd());
  const result = spawnSync('xcrun', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  logNativeOutput(log, result.stdout, result.stderr);
}

function runXcrun(args: string[], message: string, log?: NativeBuildLogger): void {
  logNativeCommand(log, 'xcrun', args, process.cwd());
  const streamOutput = Boolean(log);
  const result = spawnSync('xcrun', args, {
    encoding: streamOutput ? undefined : 'utf8',
    stdio: streamOutput ? 'inherit' : 'pipe',
  });
  if (!streamOutput) logNativeOutput(log, result.stdout, result.stderr);
  if (result.error) throw new Error(`${message} xcrun not found. Run \`feather doctor --build-target ios\` for setup guidance.`);
  if (result.status !== 0) {
    throw new Error(`${message} ${(result.stderr || result.stdout || `exit code ${result.status ?? 'unknown'}`).toString().trim()}`.trim());
  }
}
