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
  logNativeCommand,
  logNativeOutput,
  logNativeStep,
  patchTextFile,
  resolveWorkspacePath,
  type NativeCacheInfo,
  type NativeBuildLogger,
} from './native.js';
import { androidProductId } from './validation.js';

export type AndroidBuildModeOptions = {
  release?: boolean;
  cache?: boolean;
  debuggerSignature?: string;
  verbose?: boolean;
  log?: NativeBuildLogger;
  onCache?: (cache: NativeCacheInfo) => void;
};

export function buildAndroid(config: ResolvedBuildConfig, stageDir: string, options: AndroidBuildModeOptions = {}): BuildArtifact[] {
  const androidConfig = config.targets.android ?? {};
  const loveAndroidDir = androidConfig.loveAndroidDir ? resolve(config.projectDir, androidConfig.loveAndroidDir) : '';
  if (!androidConfig.loveAndroidDir) {
    throw new Error('Android build requires targets.android.loveAndroidDir in feather.build.json.');
  }
  if (!existsSync(loveAndroidDir)) {
    throw new Error(`Android template not found at ${loveAndroidDir}. Run \`feather build vendor add android --dir ${config.projectDir}\` or update targets.android.loveAndroidDir in feather.build.json.`);
  }

  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  logNativeStep(options.log, `Created .love archive: ${lovePath}`);
  const gradleTask = androidConfig.gradleTask
    ?? (androidConfig.recordAudio ? 'assembleEmbedRecordDebug' : 'assembleEmbedNoRecordDebug');
  if (options.release || options.cache === false) {
    logNativeStep(options.log, `Build cache: ${options.release ? 'disabled for release build' : 'disabled by --no-cache'}`);
  }
  logNativeStep(options.log, `Android template: ${loveAndroidDir}`);
  const workspace = createNativeWorkspace('feather-android-', loveAndroidDir, 'love-android', {
    enabled: !options.release && options.cache !== false,
    target: 'android',
    outDir: config.outDir,
    log: options.log,
    requiredPaths: [process.platform === 'win32' ? 'gradlew.bat' : 'gradlew', 'app/build.gradle'],
    keyParts: {
      productId: androidProductId(config),
      displayName: androidConfig.displayName ?? config.name,
      orientation: androidConfig.orientation ?? 'landscape',
      recordAudio: Boolean(androidConfig.recordAudio),
      versionCode: androidConfig.versionCode ?? 1,
      versionName: androidConfig.versionName ?? config.version,
      gradleTask,
      artifactPath: androidConfig.artifactPath,
      debuggerSignature: options.debuggerSignature,
    },
  });
  options.onCache?.(workspace.cache);
  logNativeStep(options.log, `Android workspace: ${workspace.dir}`);

  try {
    const embeddedLovePath = join(workspace.dir, 'app', 'src', 'embed', 'assets', 'game.love');
    mkdirSync(dirname(embeddedLovePath), { recursive: true });
    cpSync(lovePath, embeddedLovePath, { force: true });
    logNativeStep(options.log, `Embedded game.love: ${embeddedLovePath}`);

    patchAndroidProject(config, workspace.dir);
    patchAndroidEmbeddedGameLoader(workspace.dir);
    logNativeStep(options.log, 'Patched Android metadata');

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
      runGradleTask(gradleCommand, workspace.dir, bundleTask, options.log);
      runGradleTask(gradleCommand, workspace.dir, apkTask, options.log);

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
      logNativeStep(options.log, `Copied AAB artifact: ${aabPath}`);
      logNativeStep(options.log, `Copied APK artifact: ${apkPath}`);
      return [
        { target: 'android', type: 'love', path: lovePath },
        { target: 'android', type: 'aab', path: aabPath },
        { target: 'android', type: 'apk', path: apkPath },
      ];
    }

    runGradleTask(gradleCommand, workspace.dir, gradleTask, options.log);
    const apkPath = copyAndroidApkArtifact(config, workspace.dir, base);
    logNativeStep(options.log, `Copied APK artifact: ${apkPath}`);
    return [
      { target: 'android', type: 'love', path: lovePath },
      { target: 'android', type: 'apk', path: apkPath },
    ];
  } finally {
    workspace.cleanup();
  }
}

function patchAndroidEmbeddedGameLoader(workDir: string): void {
  const gameActivityPath = join(workDir, 'love', 'src', 'main', 'java', 'org', 'love2d', 'android', 'GameActivity.java');
  patchTextFile(gameActivityPath, (source) => {
    if (source.includes('Feather: forcing embedded game.love from assets')) return source;
    return source.replace(
      /embed\s*=\s*getResources\(\)\.getBoolean\(R\.bool\.embed\);/,
      [
        'embed = getResources().getBoolean(R.bool.embed);',
        '        try {',
        '            InputStream featherGameStream = getAssets().open("game.love");',
        '            featherGameStream.close();',
        '            if (!embed) {',
        '                Log.d("GameActivity", "Feather: forcing embedded game.love from assets.");',
        '            }',
        '            embed = true;',
        '            needToCopyGameInArchive = true;',
        '        } catch (IOException ignored) {',
        "            // No embedded game.love asset; keep the template's default mode.",
        '        }',
      ].join('\n'),
    );
  });
}

function runGradleTask(gradleCommand: string, workDir: string, task: string, log?: NativeBuildLogger): void {
  logNativeCommand(log, gradleCommand, [task], workDir);
  const streamOutput = Boolean(log);
  const result = spawnSync(gradleCommand, [task], {
    cwd: workDir,
    encoding: streamOutput ? undefined : 'utf8',
    shell: process.platform === 'win32',
    stdio: streamOutput ? 'inherit' : 'pipe',
  });
  if (!streamOutput) logNativeOutput(log, result.stdout, result.stderr);
  if (result.error) throw new Error(`Gradle wrapper failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Gradle task ${task} failed with exit code ${result.status ?? 'unknown'}`).toString().trim());
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

  patchTextFile(join(workDir, 'gradle.properties'), (source) => {
    let next = source
      .split('\n')
      .filter((line) => !/^app\.name\s*=/.test(line) && !/^app\.name_byte_array\s*=/.test(line))
      .join('\n');
    next = setGradleProperty(next, 'app.name_byte_array', utf8ByteArray(displayName));
    next = setGradleProperty(next, 'app.application_id', productId);
    next = setGradleProperty(next, 'app.orientation', orientation);
    next = setGradleProperty(next, 'app.version_code', String(versionCode));
    next = setGradleProperty(next, 'app.version_name', versionName);
    return next;
  });

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

function setGradleProperty(source: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.replace(/\s*$/, '')}\n${line}\n`;
}

function utf8ByteArray(value: string): string {
  return [...Buffer.from(value, 'utf8')].join(',');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
