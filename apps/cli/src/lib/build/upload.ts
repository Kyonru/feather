import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadBuildConfig, type LoadBuildConfigOptions, type UploadTarget } from './config.js';
import { artifactForTarget, readLatestManifest, resolveArtifactPath } from './files.js';
import { inspectUploadArtifact, uploadSafetyWarning, type UploadSafetyResult } from './upload-safety.js';

export type UploadOptions = LoadBuildConfigOptions & {
  target: UploadTarget;
  buildTarget?: string;
  buildDir?: string;
  project?: string;
  channel?: string;
  userVersion?: string;
  dryRun?: boolean;
  ifChanged?: boolean;
  hidden?: boolean;
  allowFeatherRuntime?: boolean;
  trustedFeatherFreeBuild?: boolean;
};

export type UploadResult = {
  ok: true;
  dryRun: boolean;
  target: UploadTarget;
  buildTarget: string;
  artifact: string;
  project: string;
  channel: string;
  userVersion: string;
  command: string[];
  safety: UploadSafetyResult;
  warning?: string;
} | {
  ok: false;
  error: string;
  safety?: UploadSafetyResult;
};

export function runUpload(options: UploadOptions): UploadResult {
  try {
    if (options.target === 'steam') {
      return { ok: false, error: 'Upload target "steam" is planned but not supported yet.' };
    }

    const config = loadBuildConfig(options);
    const outDir = options.buildDir ? resolve(config.projectDir, options.buildDir) : config.outDir;
    const manifest = readLatestManifest(outDir);
    if (!manifest) throw new Error(`No build manifest found in ${outDir}. Run \`feather build <target>\` first.`);
    const buildTarget = options.buildTarget ?? manifest.target;
    const artifact = artifactForTarget(manifest, buildTarget);
    if (!artifact) throw new Error(`No artifact found for ${buildTarget}. Run \`feather build ${buildTarget}\` first.`);
    if (!existsSync(artifact.path)) throw new Error(`Build artifact is missing: ${artifact.path}`);

    const itch = config.upload.itch ?? {};
    const project = options.project ?? itch.project;
    if (!project) throw new Error('Itch upload requires upload.itch.project in feather.build.json.');
    const channel = options.channel ?? itch.channels?.[buildTarget] ?? buildTarget;
    const userVersion = options.userVersion ?? config.version;
    const safety = inspectUploadArtifact(resolveArtifactPath(artifact.path));
    const warning = options.trustedFeatherFreeBuild && safety.status === 'unknown'
      ? undefined
      : uploadSafetyWarning(safety) ?? undefined;
    const blockedBySafety = safety.status === 'unsafe' || (safety.status === 'unknown' && !options.trustedFeatherFreeBuild);
    if (!options.dryRun && blockedBySafety && !options.allowFeatherRuntime) {
      return {
        ok: false,
        error:
          safety.status === 'unsafe'
            ? 'Upload blocked because Feather runtime/debugging files were detected. Pass --allow-feather-runtime only for intentional internal builds.'
            : 'Upload blocked because Feather could not inspect the artifact for runtime/debugging files. Pass --allow-feather-runtime only if you have verified the artifact.',
        safety,
      };
    }
    const command = [
      'butler',
      'push',
      resolveArtifactPath(artifact.path),
      `${project}:${channel}`,
      '--userversion',
      userVersion,
      ...(options.ifChanged ? ['--if-changed'] : []),
      ...(options.hidden ? ['--hidden'] : []),
    ];

    if (!options.dryRun) {
      const result = spawnSync(command[0]!, command.slice(1), { encoding: 'utf8', stdio: 'pipe' });
      if (result.error) throw new Error('butler not found. Run `feather doctor --upload-target itch`.');
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'butler push failed').trim());
    }

    return {
      ok: true,
      dryRun: Boolean(options.dryRun),
      target: 'itch',
      buildTarget,
      artifact: resolveArtifactPath(artifact.path),
      project,
      channel,
      userVersion,
      command,
      safety,
      warning,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
