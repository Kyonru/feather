/* eslint-disable no-undef */
import { assert, join, makeTmp, mkdirSync, test, writeFileSync } from './helpers.mjs';
import { createZipBuffer } from '../../dist/lib/build/archive.js';
import { inspectUploadArtifact } from '../../dist/lib/build/upload-safety.js';

function zip(entries) {
  return createZipBuffer(
    entries.map(([name, data]) => ({
      name,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
    })),
  );
}

function unsafeLove() {
  return zip([
    ['main.lua', 'function love.draw() end\n'],
    ['feather/init.lua', 'return {}\n'],
  ]);
}

test('upload safety detects Feather inside nested APK love archive', () => {
  const dir = makeTmp();
  const artifact = join(dir, 'game.apk');
  writeFileSync(
    artifact,
    zip([
      ['AndroidManifest.xml', '<manifest />'],
      ['assets/game.love', unsafeLove()],
    ]),
  );

  const safety = inspectUploadArtifact(artifact);
  assert.equal(safety.status, 'unsafe');
  assert.ok(safety.detectedFiles.includes('assets/game.love!feather/init.lua'));
});

test('upload safety inspects AAB containers', () => {
  const dir = makeTmp();
  const artifact = join(dir, 'game.aab');
  writeFileSync(
    artifact,
    zip([
      ['base/manifest/AndroidManifest.xml', '<manifest />'],
      ['base/assets/game.love', zip([['main.lua', 'function love.draw() end\n']])],
    ]),
  );

  const safety = inspectUploadArtifact(artifact);
  assert.equal(safety.status, 'safe');
  assert.deepEqual(safety.detectedFiles, []);
});

test('upload safety detects Feather inside IPA app love archive', () => {
  const dir = makeTmp();
  const artifact = join(dir, 'game.ipa');
  writeFileSync(
    artifact,
    zip([
      ['Payload/Game.app/Info.plist', '<plist />'],
      ['Payload/Game.app/game.love', unsafeLove()],
    ]),
  );

  const safety = inspectUploadArtifact(artifact);
  assert.equal(safety.status, 'unsafe');
  assert.ok(safety.detectedFiles.includes('Payload/Game.app/game.love!feather/init.lua'));
});

test('upload safety detects Feather inside .app bundle love archive', () => {
  const dir = makeTmp();
  const artifact = join(dir, 'Game.app');
  mkdirSync(join(artifact, 'Contents', 'Resources', 'feather'), { recursive: true });
  writeFileSync(join(artifact, 'Info.plist'), '<plist />');
  writeFileSync(join(artifact, 'game.love'), unsafeLove());
  writeFileSync(join(artifact, 'Contents', 'Resources', 'feather', 'init.lua'), 'return {}\n');

  const safety = inspectUploadArtifact(artifact);
  assert.equal(safety.status, 'unsafe');
  assert.ok(safety.detectedFiles.includes('Contents/Resources/feather/init.lua'));
  assert.ok(safety.detectedFiles.includes('game.love!feather/init.lua'));
});

test('upload safety detects session replay artifacts', () => {
  const dir = makeTmp();
  const artifact = join(dir, 'game.love');
  writeFileSync(
    artifact,
    zip([
      ['main.lua', 'function love.draw() end\n'],
      ['feather_replays/session_1/manifest.json', '{}'],
      ['bug.featherreplay', 'archive'],
    ]),
  );

  const safety = inspectUploadArtifact(artifact);
  assert.equal(safety.status, 'unsafe');
  assert.ok(safety.detectedFiles.includes('bug.featherreplay'));
  assert.ok(safety.detectedFiles.includes('feather_replays/session_1/manifest.json'));
});
