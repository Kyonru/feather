// Stands in for the Feather CLI in job-runner tests. Behaviour is chosen by the
// first argument so a test can describe a job as a list of argv steps.
import { appendFileSync } from 'node:fs';
import { setInterval } from 'node:timers';

const [mode, ...rest] = process.argv.slice(2);
if (process.env.FAKE_CLI_LOG) appendFileSync(process.env.FAKE_CLI_LOG, `${[mode, ...rest].join(' ')}\n`);

switch (mode) {
  case 'ok':
    console.log(`ran ${rest.join(' ')}`);
    break;
  case 'fail':
    console.log('working…');
    console.error('✖ Unknown plugin: nope');
    console.error('  Available: console, hot-reload');
    process.exitCode = 3;
    break;
  case 'json':
    console.log(JSON.stringify({ projectDir: '/p', mode: 'cli', configCreated: true, plugins: ['console'] }, null, 2));
    break;
  case 'noisy-json':
    console.log('✔ Patched main.lua with feather.auto require');
    console.log(JSON.stringify({ installed: [{ id: 'console' }], skipped: [] }, null, 2));
    break;
  case 'stdin':
    // A prompt nobody can answer must not hang the job: stdin is closed.
    process.stdin.on('data', () => {});
    process.stdin.on('end', () => {
      console.error('✖ stdin closed');
      process.exitCode = 4;
    });
    break;
  case 'hang':
    console.log('started');
    setInterval(() => {}, 1000);
    break;
  case 'env':
    console.log(JSON.stringify({ NO_COLOR: process.env.NO_COLOR ?? null }));
    break;
  default:
    console.error(`✖ unknown fake mode ${mode}`);
    process.exitCode = 2;
}
