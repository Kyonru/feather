import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// `extension:test` runs `extension:build` first, which runs prepare.mjs without
// `--binaries`, so bundled-bin/ must hold the dev launcher. These tests execute
// it rather than inspecting it: after the move to apps/, the launcher imported a
// path that no longer existed and every check that only looked at files passed.

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundledBin = join(extensionRoot, 'bundled-bin');
const launcher = join(bundledBin, 'feather-dev.mjs');
const repoRoot = join(extensionRoot, '..', '..');

test('the prepared dev launcher exists and runs the workspace CLI', () => {
  assert.ok(existsSync(launcher), `${launcher} is missing; run \`pnpm run extension:prepare\``);
  const version = execFileSync(process.execPath, [launcher, '--version'], { encoding: 'utf8' }).trim();
  const cliVersion = JSON.parse(readFileSync(join(repoRoot, 'apps', 'cli', 'package.json'), 'utf8')).version;
  assert.equal(version, cliVersion);
});

test('the dev launcher is not shadowed by stale platform binaries', () => {
  assert.equal(existsSync(join(bundledBin, 'feather')), false, 'a dev build must not bundle Bun binaries');
});

test('the bundled snapshot records the platform it vendors', () => {
  const platform = JSON.parse(readFileSync(join(bundledBin, 'platform.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));
  assert.equal(platform.featherPlatform, manifest.featherPlatform);
});

test('the marketplace icon generator resolves the post-v4 repository asset', () => {
  const generator = readFileSync(join(extensionRoot, 'scripts', 'generate-icon.mjs'), 'utf8');
  assert.match(generator, /join\(extensionRoot, '\.\.', '\.\.'\)/);
  assert.ok(existsSync(join(repoRoot, 'public', 'feather.svg')), 'the marketplace icon source is missing');
});

test('the prepared package carries the canonical repository license', () => {
  assert.equal(readFileSync(join(extensionRoot, 'LICENSE'), 'utf8'), readFileSync(join(repoRoot, 'LICENSE'), 'utf8'));
});

test('packaging restores the development launcher after building the VSIX', () => {
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.match(rootManifest.scripts['extension:package'], /scripts\/package\.mjs$/);
  const packageScript = readFileSync(join(extensionRoot, 'scripts', 'package.mjs'), 'utf8');
  assert.match(packageScript, /finally\s*\{/);
  assert.match(packageScript, /prepare\.mjs/);
});
