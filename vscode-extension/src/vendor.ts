import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type RunTarget = 'desktop' | 'web' | 'android' | 'ios' | 'steamos';

export const ALL_RUN_TARGETS: RunTarget[] = ['desktop', 'web', 'android', 'ios', 'steamos'];

type VendorRequirement = {
  label: string;
  checkPath: string;
  vendorArg: string;
};

const VENDOR_REQUIREMENTS: Partial<Record<RunTarget, VendorRequirement>> = {
  web: {
    label: 'love.js (web)',
    checkPath: join('vendor', 'love.js', 'index.html'),
    vendorArg: 'web',
  },
  android: {
    label: 'love-android',
    checkPath: join('vendor', 'love-android', 'gradlew'),
    vendorArg: 'android',
  },
  ios: {
    label: 'love-ios',
    checkPath: join('vendor', 'love-ios', 'platform', 'xcode', 'love.xcodeproj'),
    vendorArg: 'ios',
  },
};

export function vendorPresent(root: string, target: RunTarget): boolean {
  const req = VENDOR_REQUIREMENTS[target];
  if (!req) return true;
  return existsSync(join(root, req.checkPath));
}

export function vendorLabel(target: RunTarget): string {
  return VENDOR_REQUIREMENTS[target]?.label ?? target;
}

export function vendorArg(target: RunTarget): string | undefined {
  return VENDOR_REQUIREMENTS[target]?.vendorArg;
}

export function targetIcon(target: RunTarget): string {
  switch (target) {
    case 'desktop': return 'desktop-download';
    case 'web': return 'globe';
    case 'android': return 'device-mobile';
    case 'ios': return 'device-mobile';
    case 'steamos': return 'game';
  }
}
