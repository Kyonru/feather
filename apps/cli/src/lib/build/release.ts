import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertNoSymlinkEscape } from '../path-safety.js';
import { runBuild, type BuildResult } from './build.js';
import { latestManifestPath, readLatestManifest, type BuildArtifact } from './files.js';
import { loadBuildConfig, type LoadBuildConfigOptions, type ResolvedBuildConfig } from './config.js';
import { inspectUploadArtifact, uploadSafetyWarning, type UploadSafetyResult } from './upload-safety.js';
import { androidProductId, assertBuildConfigValidForTarget, iosBundleIdentifier } from './validation.js';

export const releaseTargets = ['ios', 'android'] as const;
export const releaseLanes = ['beta', 'production', 'metadata', 'screenshots'] as const;

export type ReleaseTarget = typeof releaseTargets[number];
export type ReleaseLane = typeof releaseLanes[number];

export type ReleaseInitOptions = LoadBuildConfigOptions & {
  dryRun?: boolean;
  json?: boolean;
};

export type ReleaseRunOptions = LoadBuildConfigOptions & {
  target: ReleaseTarget;
  lane: ReleaseLane;
  dryRun?: boolean;
  clean?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  skipBuild?: boolean;
};

export type FastlaneCommandPlan = {
  cwd: string;
  command: string[];
  env: Record<string, string>;
};

export type ReleaseInitResult = {
  ok: true;
  dryRun: boolean;
  projectDir: string;
  fastlaneDir: string;
  files: Array<{ path: string; action: 'create' | 'skip' }>;
} | {
  ok: false;
  error: string;
};

export type ReleaseRunResult = {
  ok: true;
  dryRun: boolean;
  target: ReleaseTarget;
  lane: ReleaseLane;
  projectDir: string;
  fastlaneDir: string;
  command: string[];
  artifacts: BuildArtifact[];
  safety: UploadSafetyResult[];
  build?: Extract<BuildResult, { ok: true }>;
} | {
  ok: false;
  error: string;
};

export function isReleaseTarget(value: string): value is ReleaseTarget {
  return (releaseTargets as readonly string[]).includes(value);
}

export function isReleaseLane(value: string): value is ReleaseLane {
  return (releaseLanes as readonly string[]).includes(value);
}

export function initFastlaneRelease(options: ReleaseInitOptions = {}): ReleaseInitResult {
  try {
    const config = loadBuildConfig(options);
    const fastlaneDir = fastlanePath(config);
    assertNoSymlinkEscape(config.projectDir, fastlaneDir, 'Fastlane directory');
    const files = fastlaneScaffold(config).map((file) => ({
      ...file,
      action: existsSync(file.path) ? 'skip' as const : 'create' as const,
    }));
    if (!options.dryRun) {
      for (const file of files) {
        if (file.action === 'skip') continue;
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.content);
      }
    }
    return {
      ok: true,
      dryRun: Boolean(options.dryRun),
      projectDir: config.projectDir,
      fastlaneDir,
      files: files.map(({ path, action }) => ({ path, action })),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function runFastlaneRelease(options: ReleaseRunOptions): ReleaseRunResult {
  try {
    const config = loadBuildConfig(options);
    assertBuildConfigValidForTarget(config, options.target, true);
    const fastlaneDir = fastlanePath(config);
    assertNoSymlinkEscape(config.projectDir, fastlaneDir, 'Fastlane directory');
    if (!existsSync(fastlaneDir)) {
      throw new Error(`Fastlane directory not found: ${fastlaneDir}. Run \`feather release init --dir ${config.projectDir}\`.`);
    }

    const shouldBuild = !options.dryRun && !options.skipBuild && (options.lane === 'beta' || options.lane === 'production');
    const build = shouldBuild
      ? runBuild({
          target: options.target,
          projectDir: config.projectDir,
          configPath: options.configPath,
          outDir: options.outDir,
          name: options.name,
          version: options.version,
          clean: options.clean,
          dryRun: false,
          release: true,
          noCache: options.noCache,
          debugger: false,
          skipProductionConfigPreflight: true,
          verbose: options.verbose,
          log: options.verbose ? console.log : undefined,
        })
      : undefined;
    if (build && !build.ok) return { ok: false, error: build.error };

    const artifacts = collectReleaseArtifacts(config, options.target, build);
    const safety = artifacts.map((artifact) => inspectUploadArtifact(artifact.path));
    const unsafe = safety.find((result) => result.status === 'unsafe');
    if (unsafe) {
      throw new Error(`Release blocked because Feather runtime/debugging files were detected in ${unsafe.artifact}.\n${unsafe.detectedFiles.join('\n')}`);
    }

    const plan = fastlaneCommand(config, options.target, options.lane, artifacts);
    if (!options.dryRun) {
      const result = spawnSync(plan.command[0]!, plan.command.slice(1), {
        cwd: plan.cwd,
        env: { ...process.env, ...plan.env },
        encoding: options.verbose ? undefined : 'utf8',
        stdio: options.verbose ? 'inherit' : 'pipe',
      });
      if (result.error) {
        const executable = plan.command.slice(0, plan.command[0] === 'bundle' ? 3 : 1).join(' ');
        throw new Error(`${executable} not found. Install Fastlane or run \`feather doctor --target ${options.target} --release\`.`);
      }
      if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `fastlane failed with exit code ${result.status ?? 'unknown'}`).toString().trim());
      }
    }

    return {
      ok: true,
      dryRun: Boolean(options.dryRun),
      target: options.target,
      lane: options.lane,
      projectDir: config.projectDir,
      fastlaneDir,
      command: plan.command,
      artifacts,
      safety,
      build: build?.ok ? build : undefined,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function fastlanePath(config: ResolvedBuildConfig): string {
  const configured = config.release.fastlane?.path ?? 'fastlane';
  return resolve(config.projectDir, configured);
}

export function fastlaneCommand(
  config: ResolvedBuildConfig,
  target: ReleaseTarget,
  lane: ReleaseLane,
  artifacts: BuildArtifact[] = [],
): FastlaneCommandPlan {
  const mode = config.release.fastlane?.bundleExec ?? 'auto';
  const useBundle = mode === 'always' || (mode === 'auto' && existsSync(join(config.projectDir, 'Gemfile')));
  const command = useBundle
    ? ['bundle', 'exec', 'fastlane', target, lane]
    : ['fastlane', target, lane];
  const env = fastlaneEnv(config, target, lane, artifacts);
  return { cwd: config.projectDir, command, env };
}

function fastlaneEnv(
  config: ResolvedBuildConfig,
  target: ReleaseTarget,
  lane: ReleaseLane,
  artifacts: BuildArtifact[],
): Record<string, string> {
  const artifact = (type: string) => artifacts.find((item) => item.type === type)?.path ?? '';
  const androidFastlane = config.targets.android?.release?.fastlane ?? {};
  const iosFastlane = config.targets.ios?.release?.fastlane ?? {};
  const loveAndroidDir = config.targets.android?.loveAndroidDir ? resolve(config.projectDir, config.targets.android.loveAndroidDir) : '';
  const loveIosDir = config.targets.ios?.loveIosDir ? resolve(config.projectDir, config.targets.ios.loveIosDir) : '';
  return {
    FEATHER_PROJECT_DIR: config.projectDir,
    FEATHER_OUT_DIR: config.outDir,
    FEATHER_BUILD_MANIFEST: latestManifestPath(config.outDir),
    FEATHER_RELEASE_TARGET: target,
    FEATHER_RELEASE_LANE: lane,
    FEATHER_ANDROID_PROJECT_DIR: target === 'android' ? loveAndroidDir : '',
    FEATHER_ANDROID_AAB: target === 'android' ? artifact('aab') : '',
    FEATHER_ANDROID_APK: target === 'android' ? artifact('apk') : '',
    FEATHER_ANDROID_PACKAGE_NAME: androidFastlane.packageName ?? androidProductId(config),
    FEATHER_ANDROID_TRACK: androidFastlane.track ?? (lane === 'production' ? 'production' : 'internal'),
    FEATHER_ANDROID_RELEASE_STATUS: androidFastlane.releaseStatus ?? (lane === 'production' ? 'draft' : 'completed'),
    FEATHER_ANDROID_SERVICE_ACCOUNT_JSON: envValue(androidFastlane.serviceAccountJsonEnv),
    FEATHER_ANDROID_KEYSTORE_PATH: androidFastlane.keystorePath ? resolve(config.projectDir, androidFastlane.keystorePath) : '',
    FEATHER_ANDROID_KEY_ALIAS: androidFastlane.keyAlias ?? '',
    FEATHER_ANDROID_STORE_PASSWORD: envValue(androidFastlane.storePasswordEnv),
    FEATHER_ANDROID_KEY_PASSWORD: envValue(androidFastlane.keyPasswordEnv),
    FEATHER_IOS_XCODEPROJ: target === 'ios' && loveIosDir ? join(loveIosDir, 'platform', 'xcode', 'love.xcodeproj') : '',
    FEATHER_IOS_IPA: target === 'ios' ? artifact('ipa') : '',
    FEATHER_IOS_XCARCHIVE: target === 'ios' ? artifact('xcarchive') : '',
    FEATHER_IOS_BUNDLE_IDENTIFIER: iosFastlane.bundleIdentifier ?? iosBundleIdentifier(config),
    FEATHER_IOS_TEAM_ID: iosFastlane.teamId ?? config.targets.ios?.release?.teamId ?? config.targets.ios?.teamId ?? '',
    FEATHER_IOS_EXPORT_METHOD: iosFastlane.exportMethod ?? config.targets.ios?.release?.exportMethod ?? 'app-store',
    FEATHER_IOS_ASC_API_KEY_PATH: envValue(iosFastlane.appStoreConnectApiKeyPathEnv),
    FEATHER_IOS_ASC_ISSUER_ID: envValue(iosFastlane.appStoreConnectIssuerIdEnv),
    FEATHER_IOS_ASC_KEY_ID: envValue(iosFastlane.appStoreConnectKeyIdEnv),
    FEATHER_IOS_ASC_KEY_CONTENT: envValue(iosFastlane.appStoreConnectKeyContentEnv),
    FEATHER_IOS_MATCH_GIT_URL: envValue(iosFastlane.matchGitUrlEnv),
    FEATHER_IOS_MATCH_PASSWORD: envValue(iosFastlane.matchPasswordEnv),
    FEATHER_IOS_MATCH_TYPE: iosFastlane.matchType ?? (lane === 'production' ? 'appstore' : 'adhoc'),
  };
}

function envValue(name: string | undefined): string {
  return name ? process.env[name] ?? '' : '';
}

function collectReleaseArtifacts(
  config: ResolvedBuildConfig,
  target: ReleaseTarget,
  build: BuildResult | undefined,
): BuildArtifact[] {
  if (build?.ok) return build.artifacts.filter((artifact) => artifact.target === target);
  const manifest = readLatestManifest(config.outDir);
  if (!manifest) return [];
  return manifest.artifacts.filter((artifact) => artifact.target === target);
}

function fastlaneScaffold(config: ResolvedBuildConfig): Array<{ path: string; content: string }> {
  const root = fastlanePath(config);
  return [
    { path: join(root, 'Fastfile'), content: fastfile() },
    { path: join(root, 'Appfile'), content: appfile() },
    { path: join(root, '.env.example'), content: envExample() },
    { path: join(root, 'README.md'), content: readme() },
    { path: join(root, 'metadata', 'ios', 'en-US', 'description.txt'), content: `${config.description ?? config.name}\n` },
    { path: join(root, 'metadata', 'android', 'en-US', 'full_description.txt'), content: `${config.description ?? config.name}\n` },
    { path: join(root, 'screenshots', 'ios', '.gitkeep'), content: '' },
    { path: join(root, 'screenshots', 'android', '.gitkeep'), content: '' },
  ];
}

function fastfile(): string {
  return `default_platform(:ios)

def feather_required_env(name)
  value = ENV[name].to_s
  UI.user_error!("Missing #{name}") if value.empty?
  value
end

def feather_ios_api_key
  path = ENV["FEATHER_IOS_ASC_API_KEY_PATH"].to_s
  return app_store_connect_api_key(path: path) unless path.empty?

  key_id = ENV["FEATHER_IOS_ASC_KEY_ID"].to_s
  issuer_id = ENV["FEATHER_IOS_ASC_ISSUER_ID"].to_s
  key_content = ENV["FEATHER_IOS_ASC_KEY_CONTENT"].to_s
  return nil if key_id.empty? || issuer_id.empty? || key_content.empty?
  app_store_connect_api_key(key_id: key_id, issuer_id: issuer_id, key_content: key_content)
end

platform :ios do
  desc "Build and upload the Feather IPA to TestFlight"
  lane :beta do
    api_key = feather_ios_api_key
    upload_to_testflight(ipa: feather_required_env("FEATHER_IOS_IPA"), api_key: api_key, skip_waiting_for_build_processing: true)
  end

  desc "Upload the Feather IPA to App Store Connect"
  lane :production do
    api_key = feather_ios_api_key
    upload_to_app_store(ipa: feather_required_env("FEATHER_IOS_IPA"), api_key: api_key, submit_for_review: false, automatic_release: false)
  end

  desc "Validate App Store metadata"
  lane :metadata do
    deliver(metadata_path: "fastlane/metadata/ios", skip_binary_upload: true, skip_screenshots: true, force: true)
  end

  desc "Sync iOS screenshots"
  lane :screenshots do
    deliver(screenshots_path: "fastlane/screenshots/ios", skip_binary_upload: true, skip_metadata: true, force: true)
  end
end

platform :android do
  desc "Upload the Feather AAB to the configured Play beta/internal track"
  lane :beta do
    upload_to_play_store(
      aab: feather_required_env("FEATHER_ANDROID_AAB"),
      package_name: feather_required_env("FEATHER_ANDROID_PACKAGE_NAME"),
      json_key: feather_required_env("FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"),
      track: ENV["FEATHER_ANDROID_TRACK"].to_s.empty? ? "internal" : ENV["FEATHER_ANDROID_TRACK"],
      release_status: ENV["FEATHER_ANDROID_RELEASE_STATUS"].to_s.empty? ? "completed" : ENV["FEATHER_ANDROID_RELEASE_STATUS"]
    )
  end

  desc "Upload the Feather AAB to the Play production track as draft by default"
  lane :production do
    upload_to_play_store(
      aab: feather_required_env("FEATHER_ANDROID_AAB"),
      package_name: feather_required_env("FEATHER_ANDROID_PACKAGE_NAME"),
      json_key: feather_required_env("FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"),
      track: "production",
      release_status: ENV["FEATHER_ANDROID_RELEASE_STATUS"].to_s.empty? ? "draft" : ENV["FEATHER_ANDROID_RELEASE_STATUS"]
    )
  end

  desc "Validate Google Play metadata"
  lane :metadata do
    supply(metadata_path: "fastlane/metadata/android", package_name: feather_required_env("FEATHER_ANDROID_PACKAGE_NAME"), json_key: feather_required_env("FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"), skip_upload_apk: true, skip_upload_aab: true)
  end

  desc "Sync Android screenshots"
  lane :screenshots do
    supply(metadata_path: "fastlane/metadata/android", package_name: feather_required_env("FEATHER_ANDROID_PACKAGE_NAME"), json_key: feather_required_env("FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"), skip_upload_apk: true, skip_upload_aab: true)
  end
end
`;
}

function appfile(): string {
  return `app_identifier(ENV["FEATHER_IOS_BUNDLE_IDENTIFIER"])
apple_team_id(ENV["FEATHER_IOS_TEAM_ID"]) unless ENV["FEATHER_IOS_TEAM_ID"].to_s.empty?
json_key_file(ENV["FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"]) unless ENV["FEATHER_ANDROID_SERVICE_ACCOUNT_JSON"].to_s.empty?
package_name(ENV["FEATHER_ANDROID_PACKAGE_NAME"]) unless ENV["FEATHER_ANDROID_PACKAGE_NAME"].to_s.empty?
`;
}

function envExample(): string {
  return `# Feather reads these values from your shell/CI environment.
# Do not commit real secrets.

APP_STORE_CONNECT_API_KEY_PATH=
APP_STORE_CONNECT_ISSUER_ID=
APP_STORE_CONNECT_KEY_ID=
APP_STORE_CONNECT_KEY_CONTENT=
MATCH_GIT_URL=
MATCH_PASSWORD=

GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
ANDROID_STORE_PASSWORD=
ANDROID_KEY_PASSWORD=
`;
}

function readme(): string {
  return `# Feather Fastlane

These files are generated by \`feather release init\` and are intended to be edited.

Feather builds clean mobile artifacts first, then runs lanes with explicit \`FEATHER_*\` environment variables.
Secrets should come from your shell or CI environment, not \`feather.build.json\`.

Common commands:

\`\`\`bash
feather release ios beta --dir .
feather release ios production --dir .
feather release android beta --dir .
feather release android production --dir .
\`\`\`
`;
}

export function releaseSafetyWarnings(safety: UploadSafetyResult[]): string[] {
  return safety.map((item) => uploadSafetyWarning(item)).filter((item): item is string => Boolean(item));
}
