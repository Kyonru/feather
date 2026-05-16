import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
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

export function buildAndroid(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
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
    const gradleTask = androidConfig.gradleTask
      ?? (androidConfig.recordAudio ? 'assembleEmbedRecordDebug' : 'assembleEmbedNoRecordDebug');
    const result = spawnSync(gradleCommand, [gradleTask], {
      cwd: workspace.dir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.error) throw new Error(`Gradle wrapper failed to start: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `Gradle task ${gradleTask} failed`).trim());
    }

    const apkSource = androidConfig.artifactPath
      ? resolveWorkspacePath(workspace.dir, androidConfig.artifactPath, 'Android artifact path')
      : findFirstPath(join(workspace.dir, 'app', 'build', 'outputs'), (_path, entry) => entry.isFile() && entry.name.endsWith('.apk'));
    if (!apkSource || !existsSync(apkSource)) {
      throw new Error('Android build completed but no APK artifact was found. Set targets.android.artifactPath if your template writes elsewhere.');
    }
    const apkPath = join(config.outDir, `${base}-android.apk`);
    cpSync(apkSource, apkPath, { force: true });

    return [
      { target: 'android', type: 'love', path: lovePath },
      { target: 'android', type: 'apk', path: apkPath },
    ];
  } finally {
    workspace.cleanup();
  }
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
