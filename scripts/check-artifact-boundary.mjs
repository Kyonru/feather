/**
 * Fail the build if a packaged bundle contains the other application.
 *
 * The lint guards catch source imports, but they cannot see what actually ends
 * up in a bundle: a transitive dependency, a dynamic import, or a stray asset
 * can pull Studio into Inspector without any single file importing it. This
 * inspects the built output instead, which is what users install.
 *
 * Run: node scripts/check-artifact-boundary.mjs [--inspector <dir>] [--studio <dir>]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readBundle(dir) {
  let text = '';
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(js|css|html)$/.test(entry)) {
        text += readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return text;
}

/**
 * Markers chosen to be specific to one application and unlikely to appear by
 * coincidence. Route paths and component test ids are better signals than
 * package names, which minifiers can strip.
 */
const rules = [
  {
    name: 'Inspector must not contain Studio',
    dir: process.argv.includes('--inspector')
      ? process.argv[process.argv.indexOf('--inspector') + 1]
      : 'apps/inspector/dist',
    forbidden: [
      ['shader-node-picker', 'the shader graph node picker'],
      ['texture-lab-controls-panel', 'the texture lab'],
      ['particle-timeline-track', 'the particle timeline'],
    ],
  },
  {
    name: 'Studio must not contain Inspector',
    dir: process.argv.includes('--studio')
      ? process.argv[process.argv.indexOf('--studio') + 1]
      : 'apps/studio/dist',
    forbidden: [
      ['session-health-hub', "the Inspector's session health panel"],
      ['cmd:debugger:set_breakpoints', 'the debugger command surface'],
      ['get_cli_project_status', 'the CLI sidecar bridge'],
      ['feather://session-start', "the Inspector's WebSocket session events"],
    ],
  },
];

let failed = false;

for (const rule of rules) {
  const bundle = readBundle(rule.dir);
  if (!bundle) {
    console.log(`[feather] ${rule.name}: no build found at ${rule.dir}, skipping.`);
    continue;
  }
  const hits = rule.forbidden.filter(([marker]) => bundle.includes(marker));
  if (hits.length) {
    failed = true;
    console.error(`\n[feather] ${rule.name} — FAILED (${rule.dir})`);
    for (const [marker, what] of hits) {
      console.error(`    found ${what}  (marker: ${marker})`);
    }
    console.error('  Something pulled the other application into this bundle. Check for a');
    console.error('  transitive import or a dynamic import that the lint guards cannot see.');
  } else {
    console.log(`[feather] ${rule.name}: OK (${rule.dir}, ${(bundle.length / 1024).toFixed(0)} KB scanned)`);
  }
}

process.exit(failed ? 1 : 0);
