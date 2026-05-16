import { spawnSync } from 'node:child_process';
import { artifactBaseName, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig, SupportedBuildTarget } from './config.js';

export type DesktopBuildTarget = Exclude<SupportedBuildTarget, 'web' | 'android' | 'ios'>;

export function buildDesktop(config: ResolvedBuildConfig, target: DesktopBuildTarget, stageDir: string): BuildArtifact[] {
  const normalizedTarget = target === 'steamos' ? 'linux' : target;
  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const args = [
    '--output',
    config.outDir,
    '--name',
    config.name,
    '--version',
    config.version,
    '--target',
    normalizedTarget,
    stageDir,
  ];
  const result = spawnSync('love-release', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`love-release not found. Run \`feather doctor --build-target ${target}\`.`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `love-release failed for ${target}`).trim());
  }
  return [
    { target, type: 'love', path: lovePath },
    { target, type: 'external', path: config.outDir },
  ];
}
