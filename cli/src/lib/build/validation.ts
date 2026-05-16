import { resolve } from 'node:path';
import { assertSafeRelativePath } from '../path-safety.js';
import { buildSlug } from './files.js';
import type { BuildTarget, ResolvedBuildConfig } from './config.js';

const ANDROID_PRODUCT_ID_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const IOS_BUNDLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$/;
const GRADLE_TASK_RE = /^[A-Za-z0-9:_-]+$/;
const XCODE_VALUE_RE = /^[A-Za-z0-9_. -]+$/;
const TEAM_ID_RE = /^[A-Za-z0-9]+$/;
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

export function validateBuildConfigForTarget(config: ResolvedBuildConfig, target: BuildTarget): BuildValidationIssue[] {
  if (target === 'android') return validateAndroidBuildConfig(config);
  if (target === 'ios') return validateIosBuildConfig(config);
  return [];
}

export function assertBuildConfigValidForTarget(config: ResolvedBuildConfig, target: BuildTarget): void {
  const issues = validateBuildConfigForTarget(config, target);
  if (issues.length === 0) return;
  throw new Error([
    `Invalid ${target} build config.`,
    ...issues.map((issue) => `${issue.field}: ${issue.message}`),
  ].join('\n'));
}

export function validateAndroidBuildConfig(config: ResolvedBuildConfig): BuildValidationIssue[] {
  const android = config.targets.android ?? {};
  const issues: BuildValidationIssue[] = [];
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
  return issues;
}

export function validateIosBuildConfig(config: ResolvedBuildConfig): BuildValidationIssue[] {
  const ios = config.targets.ios ?? {};
  const issues: BuildValidationIssue[] = [];
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
  return issues;
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
