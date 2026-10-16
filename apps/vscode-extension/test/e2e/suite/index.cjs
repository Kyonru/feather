const assert = require('node:assert/strict');
const vscode = require('vscode');

// Runs inside the Extension Development Host. A dependency-free harness: the
// extension tests run() and fail the run by throwing. The suite previously
// called mocha's `suite()` without mocha installed, so it never ran at all.

const tests = [
  ['registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'feather.run', 'feather.init', 'feather.doctor', 'feather.plugins', 'feather.packages', 'feather.upload',
      'feather.remove', 'feather.update',
    ]) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
  }],
];

async function run() {
  const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'feather-cli-vscode');
  assert.ok(extension, 'the development extension is loaded');
  await extension.activate();

  const failures = [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ✔ ${name}`);
    } catch (err) {
      failures.push(name);
      console.error(`  ✖ ${name}\n${err && err.stack ? err.stack : err}`);
    }
  }
  console.log(`${tests.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length > 0) throw new Error(`${failures.length} extension test(s) failed: ${failures.join('; ')}`);
}

module.exports = { run };
