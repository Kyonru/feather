import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { artifactBaseName, copyDirectory, writeDirectoryZip, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig } from './config.js';

export function buildWeb(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
  const webConfig = config.targets.web ?? {};
  const loveJsDir = webConfig.loveJsDir ? resolve(config.projectDir, webConfig.loveJsDir) : '';
  if (!loveJsDir || !existsSync(loveJsDir)) {
    throw new Error('Web build requires targets.web.loveJsDir in feather.build.json.');
  }
  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const htmlDir = join(config.outDir, webConfig.outputName ?? `${base}-html`);
  copyDirectory(loveJsDir, htmlDir);
  const gameLovePath = join(htmlDir, 'game.love');
  writeFileSync(gameLovePath, readFileSync(lovePath));
  patchLoveJsIndex(join(htmlDir, 'index.html'), webConfig.title ?? config.name);
  const zipPath = writeDirectoryZip(htmlDir, join(config.outDir, `${base}-html.zip`));
  return [
    { target: 'web', type: 'love', path: lovePath },
    { target: 'web', type: 'html', path: htmlDir },
    { target: 'web', type: 'zip', path: zipPath },
  ];
}

function patchLoveJsIndex(indexPath: string, title: string): void {
  const fallback = [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>löve.js</title></head>',
    '<body><canvas id="canvas"></canvas><script src="player.min.js?g=game.love"></script></body>',
    '</html>',
    '',
  ].join('\n');
  const existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : fallback;
  let next = existing.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  if (next === existing && !/<title>/i.test(next)) {
    next = next.replace(/<head[^>]*>/i, (match) => `${match}<title>${escapeHtml(title)}</title>`);
  }
  next = next.replace(/player(?:\.min)?\.js(?:\?g=[^"']*)?/g, (match) => {
    const script = match.startsWith('player.min') ? 'player.min.js' : 'player.js';
    return `${script}?g=game.love`;
  });
  if (!/\?g=game\.love/.test(next)) {
    next = next.replace('</body>', '<script src="player.min.js?g=game.love"></script></body>');
  }
  writeFileSync(indexPath, next);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]!));
}
