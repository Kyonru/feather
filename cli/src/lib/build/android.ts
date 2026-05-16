import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { artifactBaseName, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig } from './config.js';
import {
  assignmentValue,
  createNativeWorkspace,
  escapeXml,
  findFirstPath,
  patchTextFile,
  resolveWorkspacePath,
} from './native.js';
import { androidProductId } from './validation.js';

export type AndroidBuildModeOptions = {
  release?: boolean;
};

export function buildAndroid(config: ResolvedBuildConfig, stageDir: string, options: AndroidBuildModeOptions = {}): BuildArtifact[] {
  const androidConfig = config.targets.android ?? {};
  const loveAndroidDir = androidConfig.loveAndroidDir ? resolve(config.projectDir, androidConfig.loveAndroidDir) : '';
  if (!loveAndroidDir || !existsSync(loveAndroidDir)) {
    throw new Error('Android build requires targets.android.loveAndroidDir in feather.build.json.');
  }

  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const workspace = createNativeWorkspace('feather-android-', loveAndroidDir, 'love-android');

  try {
    const embeddedLovePath = join(workspace.dir, 'app', 'src', 'embed', 'assets', 'game.love');
    mkdirSync(dirname(embeddedLovePath), { recursive: true });
    cpSync(lovePath, embeddedLovePath, { force: true });

    patchAndroidProject(config, workspace.dir);

    const gradleCommand = process.platform === 'win32' ? join(workspace.dir, 'gradlew.bat') : join(workspace.dir, 'gradlew');
    if (!existsSync(gradleCommand)) {
      throw new Error('Android build requires a Gradle wrapper in targets.android.loveAndroidDir.');
    }
    if (options.release) {
      writeAndroidSigningProperties(config, workspace.dir);
      const bundleTask = androidConfig.release?.bundleTask
        ?? (androidConfig.recordAudio ? 'bundleEmbedRecordRelease' : 'bundleEmbedNoRecordRelease');
      const apkTask = androidConfig.release?.apkTask
        ?? (androidConfig.recordAudio ? 'assembleEmbedRecordRelease' : 'assembleEmbedNoRecordRelease');
      runGradleTask(gradleCommand, workspace.dir, bundleTask);
      runGradleTask(gradleCommand, workspace.dir, apkTask);

      const aabSource = androidConfig.release?.bundleArtifactPath
        ? resolveWorkspacePath(workspace.dir, androidConfig.release.bundleArtifactPath, 'Android bundle artifact path')
        : findFirstPath(join(workspace.dir, 'app', 'build', 'outputs'), (_path, entry) => entry.isFile() && entry.name.endsWith('.aab'));
      const apkSource = androidConfig.release?.apkArtifactPath
        ? resolveWorkspacePath(workspace.dir, androidConfig.release.apkArtifactPath, 'Android APK artifact path')
        : findFirstPath(join(workspace.dir, 'app', 'build', 'outputs'), (_path, entry) => entry.isFile() && entry.name.endsWith('.apk'));
      if (!aabSource || !existsSync(aabSource)) {
        throw new Error('Android release completed but no AAB artifact was found. Set targets.android.release.bundleArtifactPath if your template writes elsewhere.');
      }
      if (!apkSource || !existsSync(apkSource)) {
        throw new Error('Android release completed but no APK artifact was found. Set targets.android.release.apkArtifactPath if your template writes elsewhere.');
      }
      const aabPath = join(config.outDir, `${base}-android.aab`);
      const apkPath = join(config.outDir, `${base}-android.apk`);
      cpSync(aabSource, aabPath, { force: true });
      cpSync(apkSource, apkPath, { force: true });
      return [
        { target: 'android', type: 'love', path: lovePath },
        { target: 'android', type: 'aab', path: aabPath },
        { target: 'android', type: 'apk', path: apkPath },
      ];
    }

    const gradleTask = androidConfig.gradleTask
      ?? (androidConfig.recordAudio ? 'assembleEmbedRecordDebug' : 'assembleEmbedNoRecordDebug');
    runGradleTask(gradleCommand, workspace.dir, gradleTask);
    const apkPath = copyAndroidApkArtifact(config, workspace.dir, base);
    return [
      { target: 'android', type: 'love', path: lovePath },
      { target: 'android', type: 'apk', path: apkPath },
    ];
  } finally {
    workspace.cleanup();
  }
}

function runGradleTask(gradleCommand: string, workDir: string, task: string): void {
  const result = spawnSync(gradleCommand, [task], {
    cwd: workDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.error) throw new Error(`Gradle wrapper failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Gradle task ${task} failed`).trim());
  }
}

function copyAndroidApkArtifact(config: ResolvedBuildConfig, workDir: string, base: string): string {
  const androidConfig = config.targets.android ?? {};
  const apkSource = androidConfig.artifactPath
    ? resolveWorkspacePath(workDir, androidConfig.artifactPath, 'Android artifact path')
    : findFirstPath(join(workDir, 'app', 'build', 'outputs'), (_path, entry) => entry.isFile() && entry.name.endsWith('.apk'));
  if (!apkSource || !existsSync(apkSource)) {
    throw new Error('Android build completed but no APK artifact was found. Set targets.android.artifactPath if your template writes elsewhere.');
  }
  const apkPath = join(config.outDir, `${base}-android.apk`);
  cpSync(apkSource, apkPath, { force: true });
  return apkPath;
}

function writeAndroidSigningProperties(config: ResolvedBuildConfig, workDir: string): void {
  const release = config.targets.android?.release;
  if (!release) return;
  const signingConfigured = Boolean(release.keystorePath || release.keyAlias || release.storePasswordEnv || release.keyPasswordEnv);
  if (!signingConfigured) return;
  const required = [
    ['targets.android.release.keystorePath', release.keystorePath],
    ['targets.android.release.keyAlias', release.keyAlias],
    ['targets.android.release.storePasswordEnv', release.storePasswordEnv],
    ['targets.android.release.keyPasswordEnv', release.keyPasswordEnv],
  ] as const;
  const missing = required.filter(([, value]) => !value).map(([field]) => field);
  if (missing.length > 0) {
    throw new Error(`Android release signing is incomplete. Missing: ${missing.join(', ')}`);
  }
  const storePassword = process.env[release.storePasswordEnv!];
  const keyPassword = process.env[release.keyPasswordEnv!];
  const missingEnv = [
    storePassword ? '' : release.storePasswordEnv!,
    keyPassword ? '' : release.keyPasswordEnv!,
  ].filter(Boolean);
  if (missingEnv.length > 0) {
    throw new Error(`Android release signing environment is incomplete. Missing: ${missingEnv.join(', ')}`);
  }
  const keystorePath = resolve(config.projectDir, release.keystorePath!);
  if (!existsSync(keystorePath)) {
    throw new Error(`Android release keystore was not found: ${keystorePath}`);
  }
  writeFileSync(
    join(workDir, 'feather-signing.properties'),
    [
      `storeFile=${keystorePath}`,
      `keyAlias=${release.keyAlias}`,
      `storePassword=${storePassword}`,
      `keyPassword=${keyPassword}`,
      '',
    ].join('\n'),
  );
}

export function patchAndroidProject(config: ResolvedBuildConfig, workDir: string): void {
  const androidConfig = config.targets.android ?? {};
  const productId = androidProductId(config);
  const versionName = androidConfig.versionName ?? config.version;
  const versionCode = androidConfig.versionCode ?? 1;
  const displayName = androidConfig.displayName ?? config.name;
  const orientation = androidConfig.orientation ?? 'landscape';

  for (const file of ['app/build.gradle', 'app/build.gradle.kts', 'build.gradle', 'build.gradle.kts']) {
    patchTextFile(join(workDir, file), (source) => source
      .replace(/applicationId\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'applicationId', productId))
      .replace(/namespace\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'namespace', productId))
      .replace(/versionName\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'versionName', versionName))
      .replace(/versionCode\s*(?:=)?\s*\d+/g, (match) => assignmentValue(match, 'versionCode', String(versionCode), false)));
  }

  for (const file of ['app/src/main/res/values/strings.xml', 'app/src/embed/res/values/strings.xml']) {
    patchTextFile(join(workDir, file), (source) => source.replace(
      /<string\s+name=["']app_name["']>[\s\S]*?<\/string>/,
      `<string name="app_name">${escapeXml(displayName)}</string>`,
    ));
  }

  for (const file of ['app/src/main/AndroidManifest.xml', 'app/src/embed/AndroidManifest.xml']) {
    patchTextFile(join(workDir, file), (source) => {
      let next = source
        .replace(/android:label=["'][^"']*["']/g, `android:label="${escapeXml(displayName)}"`)
        .replace(/android:screenOrientation=["'][^"']*["']/g, `android:screenOrientation="${escapeXml(orientation)}"`);
      if (!/android:label=/.test(next)) {
        next = next.replace(/<application\b([^>]*)>/, `<application$1 android:label="${escapeXml(displayName)}">`);
      }
      if (!/android:screenOrientation=/.test(next)) {
        next = next.replace(/<activity\b([^>]*)>/, `<activity$1 android:screenOrientation="${escapeXml(orientation)}">`);
      }
      if (androidConfig.recordAudio) {
        if (!/android\.permission\.RECORD_AUDIO/.test(next)) {
          next = next.replace(/<manifest\b[^>]*>/, (match) => `${match}\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />`);
        }
      } else {
        next = next
          .split('\n')
          .filter((line) => !line.includes('android.permission.RECORD_AUDIO'))
          .join('\n');
      }
      return next;
    });
  }
}
