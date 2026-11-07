import { resolve } from 'node:path';
import { assertSafeRelativePath } from '../path-safety.js';
import { buildSlug } from './files.js';
import type { BuildTarget, ResolvedBuildConfig } from './config.js';

const ANDROID_PRODUCT_ID_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const IOS_BUNDLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$/;
const GRADLE_TASK_RE = /^[A-Za-z0-9:_-]+$/;
const XCODE_VALUE_RE = /^[A-Za-z0-9_. -]+$/;
const TEAM_ID_RE = /^[A-Za-z0-9]+$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IOS_EXPORT_METHODS = new Set([
  'app-store',
  'app-store-connect',
  'ad-hoc',
  'enterprise',
  'development',
  'developer-id',
  'mac-application',
  'release-testing',
  'debugging',
]);
const IOS_SIGNING_STYLES = new Set(['automatic', 'manual']);
const FASTLANE_BUNDLE_EXEC_MODES = new Set(['auto', 'always', 'never']);
const FASTLANE_RELEASE_STATUSES = new Set(['completed', 'draft', 'halted', 'inProgress']);
const ANDROID_ORIENTATIONS = new Set([
  'unspecified',
  'landscape',
  'portrait',
  'user',
  'behind',
  'sensor',
  'nosensor',
  'sensorLandscape',
  'sensorPortrait',
  'reverseLandscape',
  'reversePortrait',
  'fullSensor',
  'userLandscape',
  'userPortrait',
  'fullUser',
  'locked',
]);

export type BuildValidationIssue = {
  target: 'android' | 'ios';
  field: string;
  message: string;
};

export function validateBuildConfigForTarget(config: ResolvedBuildConfig, target: BuildTarget, release = false): BuildValidationIssue[] {
  if (target === 'android') return validateAndroidBuildConfig(config, release);
  if (target === 'ios') return validateIosBuildConfig(config, release);
  return [];
}

export function assertBuildConfigValidForTarget(config: ResolvedBuildConfig, target: BuildTarget, release = false): void {
  const issues = validateBuildConfigForTarget(config, target, release);
  if (issues.length === 0) return;
  throw new Error([
    `Invalid ${target} build config.`,
    ...issues.map((issue) => `${issue.field}: ${issue.message}`),
  ].join('\n'));
}

export function validateAndroidBuildConfig(config: ResolvedBuildConfig, release = false): BuildValidationIssue[] {
  const android = config.targets.android ?? {};
  const releaseConfig = android.release ?? {};
  const fastlane = releaseConfig.fastlane ?? {};
  const issues: BuildValidationIssue[] = [];
  validateFastlaneRootConfig(config, 'android', issues);
  const productId = android.productId ?? config.productId ?? defaultProductId(config, 'android');
  if (!ANDROID_PRODUCT_ID_RE.test(productId)) {
    issues.push({
      target: 'android',
      field: 'productId',
      message: 'Use a reverse-DNS Android application id, for example com.example.game.',
    });
  }
  if (android.versionCode !== undefined && (!Number.isInteger(android.versionCode) || android.versionCode < 1)) {
    issues.push({
      target: 'android',
      field: 'targets.android.versionCode',
      message: 'Use a positive integer.',
    });
  }
  if (android.versionName !== undefined && !isNonEmptySingleLine(android.versionName)) {
    issues.push({
      target: 'android',
      field: 'targets.android.versionName',
      message: 'Use a non-empty single-line version string.',
    });
  }
  if (android.orientation !== undefined && !ANDROID_ORIENTATIONS.has(android.orientation)) {
    issues.push({
      target: 'android',
      field: 'targets.android.orientation',
      message: `Use one of: ${[...ANDROID_ORIENTATIONS].join(', ')}.`,
    });
  }
  if (android.gradleTask !== undefined && (!isNonEmptySingleLine(android.gradleTask) || !GRADLE_TASK_RE.test(android.gradleTask))) {
    issues.push({
      target: 'android',
      field: 'targets.android.gradleTask',
      message: 'Use a Gradle task name containing only letters, numbers, colon, underscore, or dash.',
    });
  }
  if (android.artifactPath !== undefined) {
    validateRelativePathish(android.artifactPath, 'targets.android.artifactPath', 'android', issues);
  }
  if (release) {
    for (const [field, value] of [
      ['targets.android.release.bundleTask', releaseConfig.bundleTask],
      ['targets.android.release.apkTask', releaseConfig.apkTask],
    ] as const) {
      if (value !== undefined && (!isNonEmptySingleLine(value) || !GRADLE_TASK_RE.test(value))) {
        issues.push({
          target: 'android',
          field,
          message: 'Use a Gradle task name containing only letters, numbers, colon, underscore, or dash.',
        });
      }
    }
    for (const [field, value] of [
      ['targets.android.release.bundleArtifactPath', releaseConfig.bundleArtifactPath],
      ['targets.android.release.apkArtifactPath', releaseConfig.apkArtifactPath],
      ['targets.android.release.keystorePath', releaseConfig.keystorePath],
      ['targets.android.release.fastlane.keystorePath', fastlane.keystorePath],
    ] as const) {
      if (value !== undefined) validateRelativePathish(value, field, 'android', issues);
    }
    for (const [field, value] of [
      ['targets.android.release.fastlane.packageName', fastlane.packageName],
      ['targets.android.release.fastlane.track', fastlane.track],
      ['targets.android.release.fastlane.keyAlias', fastlane.keyAlias],
    ] as const) {
      if (value !== undefined && !isNonEmptySingleLine(value)) {
        issues.push({ target: 'android', field, message: 'Use a non-empty single-line value.' });
      }
    }
    if (fastlane.releaseStatus !== undefined && !FASTLANE_RELEASE_STATUSES.has(fastlane.releaseStatus)) {
      issues.push({
        target: 'android',
        field: 'targets.android.release.fastlane.releaseStatus',
        message: `Use one of: ${[...FASTLANE_RELEASE_STATUSES].join(', ')}.`,
      });
    }
    for (const [field, value] of [
      ['targets.android.release.fastlane.serviceAccountJsonEnv', fastlane.serviceAccountJsonEnv],
      ['targets.android.release.fastlane.storePasswordEnv', fastlane.storePasswordEnv],
      ['targets.android.release.fastlane.keyPasswordEnv', fastlane.keyPasswordEnv],
    ] as const) {
      if (value !== undefined && !ENV_NAME_RE.test(value)) {
        issues.push({ target: 'android', field, message: 'Use a valid environment variable name.' });
      }
    }
    const signingFields = [
      releaseConfig.keystorePath,
      releaseConfig.keyAlias,
      releaseConfig.storePasswordEnv,
      releaseConfig.keyPasswordEnv,
    ];
    if (signingFields.some((value) => value !== undefined)) {
      for (const [field, value] of [
        ['targets.android.release.keystorePath', releaseConfig.keystorePath],
        ['targets.android.release.keyAlias', releaseConfig.keyAlias],
        ['targets.android.release.storePasswordEnv', releaseConfig.storePasswordEnv],
        ['targets.android.release.keyPasswordEnv', releaseConfig.keyPasswordEnv],
      ] as const) {
        if (value === undefined || !isNonEmptySingleLine(value)) {
          issues.push({ target: 'android', field, message: 'Required when Android release signing is configured.' });
        }
      }
      for (const [field, value] of [
        ['targets.android.release.storePasswordEnv', releaseConfig.storePasswordEnv],
        ['targets.android.release.keyPasswordEnv', releaseConfig.keyPasswordEnv],
      ] as const) {
        if (value !== undefined && !ENV_NAME_RE.test(value)) {
          issues.push({ target: 'android', field, message: 'Use a valid environment variable name.' });
        }
      }
    }
  }
  return issues;
}

export function validateIosBuildConfig(config: ResolvedBuildConfig, release = false): BuildValidationIssue[] {
  const ios = config.targets.ios ?? {};
  const releaseConfig = ios.release ?? {};
  const fastlane = releaseConfig.fastlane ?? {};
  const issues: BuildValidationIssue[] = [];
  validateFastlaneRootConfig(config, 'ios', issues);
  const bundleId = ios.bundleIdentifier ?? ios.productId ?? config.productId ?? defaultProductId(config, 'ios');
  if (!IOS_BUNDLE_ID_RE.test(bundleId)) {
    issues.push({
      target: 'ios',
      field: 'bundleIdentifier',
      message: 'Use a reverse-DNS iOS bundle id, for example com.example.game.',
    });
  }
  for (const [field, value] of [
    ['targets.ios.scheme', ios.scheme],
    ['targets.ios.configuration', ios.configuration],
    ['targets.ios.sdk', ios.sdk],
    ['targets.ios.simulatorArch', ios.simulatorArch],
    ['targets.ios.deploymentTarget', ios.deploymentTarget],
  ] as const) {
    if (value !== undefined && (!isNonEmptySingleLine(value) || !XCODE_VALUE_RE.test(value))) {
      issues.push({
        target: 'ios',
        field,
        message: 'Use a non-empty Xcode value without shell metacharacters.',
      });
    }
  }
  if (ios.teamId !== undefined && (!isNonEmptySingleLine(ios.teamId) || !TEAM_ID_RE.test(ios.teamId))) {
    issues.push({
      target: 'ios',
      field: 'targets.ios.teamId',
      message: 'Use an Apple team id containing only letters and numbers.',
    });
  }
  if (ios.derivedDataPath !== undefined) {
    try {
      assertSafeRelativePath(ios.derivedDataPath, 'targets.ios.derivedDataPath');
    } catch (err) {
      issues.push({
        target: 'ios',
        field: 'targets.ios.derivedDataPath',
        message: (err as Error).message,
      });
    }
  }
  if (release) {
    for (const [field, value] of [
      ['targets.ios.release.archivePath', releaseConfig.archivePath],
      ['targets.ios.release.exportPath', releaseConfig.exportPath],
      ['targets.ios.release.exportOptionsPlist', releaseConfig.exportOptionsPlist],
    ] as const) {
      if (value !== undefined) validateRelativePathish(value, field, 'ios', issues);
    }
    for (const [field, value] of [
      ['targets.ios.release.configuration', releaseConfig.configuration],
      ['targets.ios.release.sdk', releaseConfig.sdk],
      ['targets.ios.release.provisioningProfileSpecifier', releaseConfig.provisioningProfileSpecifier],
    ] as const) {
      if (value !== undefined && (!isNonEmptySingleLine(value) || !XCODE_VALUE_RE.test(value))) {
        issues.push({ target: 'ios', field, message: 'Use a non-empty Xcode value without shell metacharacters.' });
      }
    }
    if (releaseConfig.teamId !== undefined && (!isNonEmptySingleLine(releaseConfig.teamId) || !TEAM_ID_RE.test(releaseConfig.teamId))) {
      issues.push({
        target: 'ios',
        field: 'targets.ios.release.teamId',
        message: 'Use an Apple team id containing only letters and numbers.',
      });
    }
    if (releaseConfig.exportMethod !== undefined && !IOS_EXPORT_METHODS.has(releaseConfig.exportMethod)) {
      issues.push({
        target: 'ios',
        field: 'targets.ios.release.exportMethod',
        message: `Use one of: ${[...IOS_EXPORT_METHODS].join(', ')}.`,
      });
    }
    if (releaseConfig.signingStyle !== undefined && !IOS_SIGNING_STYLES.has(releaseConfig.signingStyle)) {
      issues.push({
        target: 'ios',
        field: 'targets.ios.release.signingStyle',
        message: 'Use automatic or manual.',
      });
    }
    for (const [field, value] of [
      ['targets.ios.release.fastlane.bundleIdentifier', fastlane.bundleIdentifier],
    ] as const) {
      if (value !== undefined && !IOS_BUNDLE_ID_RE.test(value)) {
        issues.push({ target: 'ios', field, message: 'Use a reverse-DNS iOS bundle id, for example com.example.game.' });
      }
    }
    for (const [field, value] of [
      ['targets.ios.release.fastlane.teamId', fastlane.teamId],
    ] as const) {
      if (value !== undefined && (!isNonEmptySingleLine(value) || !TEAM_ID_RE.test(value))) {
        issues.push({ target: 'ios', field, message: 'Use an Apple team id containing only letters and numbers.' });
      }
    }
    if (fastlane.exportMethod !== undefined && !IOS_EXPORT_METHODS.has(fastlane.exportMethod)) {
      issues.push({
        target: 'ios',
        field: 'targets.ios.release.fastlane.exportMethod',
        message: `Use one of: ${[...IOS_EXPORT_METHODS].join(', ')}.`,
      });
    }
    for (const [field, value] of [
      ['targets.ios.release.fastlane.matchType', fastlane.matchType],
    ] as const) {
      if (value !== undefined && !isNonEmptySingleLine(value)) {
        issues.push({ target: 'ios', field, message: 'Use a non-empty single-line value.' });
      }
    }
    for (const [field, value] of [
      ['targets.ios.release.fastlane.appStoreConnectApiKeyPathEnv', fastlane.appStoreConnectApiKeyPathEnv],
      ['targets.ios.release.fastlane.appStoreConnectIssuerIdEnv', fastlane.appStoreConnectIssuerIdEnv],
      ['targets.ios.release.fastlane.appStoreConnectKeyIdEnv', fastlane.appStoreConnectKeyIdEnv],
      ['targets.ios.release.fastlane.appStoreConnectKeyContentEnv', fastlane.appStoreConnectKeyContentEnv],
      ['targets.ios.release.fastlane.matchGitUrlEnv', fastlane.matchGitUrlEnv],
      ['targets.ios.release.fastlane.matchPasswordEnv', fastlane.matchPasswordEnv],
    ] as const) {
      if (value !== undefined && !ENV_NAME_RE.test(value)) {
        issues.push({ target: 'ios', field, message: 'Use a valid environment variable name.' });
      }
    }
  }
  return issues;
}

function validateFastlaneRootConfig(
  config: ResolvedBuildConfig,
  target: 'android' | 'ios',
  issues: BuildValidationIssue[],
): void {
  const fastlane = config.release?.fastlane ?? {};
  if (fastlane.path !== undefined) {
    try {
      assertSafeRelativePath(fastlane.path, 'release.fastlane.path');
    } catch (err) {
      issues.push({ target, field: 'release.fastlane.path', message: (err as Error).message });
    }
  }
  if (fastlane.bundleExec !== undefined && !FASTLANE_BUNDLE_EXEC_MODES.has(fastlane.bundleExec)) {
    issues.push({
      target,
      field: 'release.fastlane.bundleExec',
      message: `Use one of: ${[...FASTLANE_BUNDLE_EXEC_MODES].join(', ')}.`,
    });
  }
}

export function defaultProductId(config: ResolvedBuildConfig, target: 'android' | 'ios'): string {
  const slug = buildSlug(config.name)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    || 'game';
  return `org.feather.${slug}.${target}`;
}

export function androidProductId(config: ResolvedBuildConfig): string {
  return config.targets.android?.productId ?? config.productId ?? defaultProductId(config, 'android');
}

export function iosBundleIdentifier(config: ResolvedBuildConfig): string {
  return config.targets.ios?.bundleIdentifier
    ?? config.targets.ios?.productId
    ?? config.productId
    ?? defaultProductId(config, 'ios');
}

function isNonEmptySingleLine(value: string): boolean {
  return value.trim().length > 0 && !/[\r\n\0]/.test(value);
}

function validateRelativePathish(
  value: string,
  field: string,
  target: 'android' | 'ios',
  issues: BuildValidationIssue[],
): void {
  if (!isNonEmptySingleLine(value)) {
    issues.push({ target, field, message: 'Use a non-empty path.' });
    return;
  }
  const resolved = resolve('/', value);
  if (resolved === '/') {
    issues.push({ target, field, message: 'Use a file path, not a directory root.' });
  }
}
