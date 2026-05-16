/* eslint-disable no-undef */
import { assert, outputOf, run, test } from './helpers.mjs';

function runOk(args) {
  const result = run(args);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.length > 0);
  return result.stdout;
}

test('help: core commands render help text', () => {
  assert.match(runOk(['--help']), /Usage:/);
  assert.match(runOk(['doctor', '--help']), /doctor/);
  assert.match(runOk(['plugin', '--help']), /plugin/);
});
