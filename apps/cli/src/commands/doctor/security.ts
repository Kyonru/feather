import type { PluginTrust } from '../../lib/plugin-utils.js';
import type { LockfileUrlFinding } from '../../lib/package/provenance.js';
import { packageUrlSummary } from '../../lib/package/provenance.js';
import type { DoctorCheck } from './checks.js';

export type SecurityPluginReport = {
  id: string;
  trust: PluginTrust;
  dangerous: boolean;
  malformed: boolean;
};

export type SecurityPackageReport = {
  id: string;
  version: string;
  trust: string;
  source: string;
};

export type SecurityReportInput = {
  checks: DoctorCheck[];
  mode: string;
  installDir: string;
  host: string;
  port: number;
  appIdMissing: boolean;
  consoleIncluded: boolean;
  weakApiKey: boolean;
  insecureConnection: boolean;
  captureScreenshot: boolean;
  hotReloadEnabled: boolean;
  broadHotReload: boolean;
  hotReloadPersistence: boolean;
  debuggerEnabled: boolean;
  writeToDisk: boolean;
  networkExposure: 'loopback' | 'wildcard' | 'lan' | 'non-loopback';
  weakNetworkAuth: boolean;
  runtimeEmbedded: boolean;
  runtimeManaged: boolean;
  symlinkEscapes: number;
  includedPlugins: string[];
  missingIncludedPlugins: string[];
  unknownIncludedPlugins: string[];
  installedPlugins: SecurityPluginReport[];
  packages: SecurityPackageReport[];
  untrustedPackageSources: LockfileUrlFinding[];
};

export function isSecurityCheck(check: DoctorCheck): boolean {
  return (
    check.group === 'Safety'
    || check.group === 'Plugins'
    || check.group === 'Packages'
    || check.group === 'Runtime'
    || check.label === 'feather.config.lua'
  );
}

export function securityChecks(checks: DoctorCheck[]): DoctorCheck[] {
  return checks.filter(isSecurityCheck);
}

export function buildSecurityReport(input: SecurityReportInput): Record<string, unknown> {
  const checks = securityChecks(input.checks);
  const failures = checks.filter((check) => check.severity === 'fail').length;
  const warnings = checks.filter((check) => check.severity === 'warn').length;

  return {
    summary: {
      failures,
      warnings,
      dangerousPlugins: input.installedPlugins.filter((plugin) => plugin.dangerous).length,
      untrustedPackageSources: input.untrustedPackageSources.length,
    },
    config: {
      mode: input.mode,
      appId: input.appIdMissing ? 'missing' : input.mode === 'disk' ? 'not-required' : 'configured',
      apiKeyStatus: input.consoleIncluded ? (input.weakApiKey ? 'weak-or-missing' : 'configured') : 'not-required',
      insecureConnection: input.insecureConnection,
      consoleIncluded: input.consoleIncluded,
      captureScreenshot: input.captureScreenshot,
      hotReloadEnabled: input.hotReloadEnabled,
      hotReloadWildcardAllowlist: input.broadHotReload,
      hotReloadPersistence: input.hotReloadPersistence,
      stepDebugger: input.debuggerEnabled,
      writeToDisk: input.writeToDisk,
    },
    network: {
      host: input.host,
      port: input.port,
      exposure: input.networkExposure,
      weakAuth: input.weakNetworkAuth,
    },
    runtime: {
      embedded: input.runtimeEmbedded,
      managed: input.runtimeManaged,
      installDir: input.installDir,
      symlinkEscapes: input.symlinkEscapes,
    },
    plugins: {
      included: input.includedPlugins,
      missingIncluded: input.missingIncludedPlugins,
      unknownIncluded: input.unknownIncludedPlugins,
      installed: input.installedPlugins,
    },
    packages: {
      total: input.packages.length,
      experimental: input.packages.filter((pkg) => pkg.trust === 'experimental').length,
      installed: input.packages,
      untrustedSources: input.untrustedPackageSources.map((finding) => ({
        id: finding.id,
        target: finding.target,
        source: packageUrlSummary(finding.url),
        reason: finding.reason,
      })),
    },
  };
}
