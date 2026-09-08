const assert = require('node:assert/strict');
const vscode = require('vscode');

suite('Feather VS Code extension', () => {
  test('registers core commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'feather.run',
      'feather.init',
      'feather.doctor',
      'feather.plugins',
      'feather.packages',
      'feather.upload',
      'feather.remove',
      'feather.update',
    ]) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
  });
});
