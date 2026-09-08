/**
 * Build feather-platform.json: the record of which component versions were
 * validated together.
 *
 * Feather v4 releases each artifact on its own train, which is what lets a CLI
 * patch ship without rebuilding the desktop app. The cost of that is having to
 * answer "which versions work together?" — this manifest is the answer.
 *
 * It deliberately stores no artifacts. npm, LuaRocks and the Marketplace already
 * host their own bytes; duplicating them onto a GitHub release would cost
 * storage to say something a few hundred bytes of JSON says better.
 *
 * Usage:
 *   node scripts/build-platform-manifest.mjs <platform-version> [--out <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const platform = process.argv[2];
if (!platform) {
  console.error('usage: node scripts/build-platform-manifest.mjs <platform-version> [--out <path>]');
  process.exit(2);
}
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex > -1 ? process.argv[outIndex + 1] : join(root, 'feather-platform.json');

function must(value, what) {
  if (!value) throw new Error(`Could not resolve ${what}`);
  return value;
}

const runtimeVersion = must(
  read('packages/runtime-lua/feather/init.lua').match(/^local FEATHER_VERSION_NAME = "([^"]+)"/m)?.[1],
  'the runtime version',
);
const protocolVersion = Number(
  must(
    read('apps/inspector/src/constants/feather-protocol.ts').match(/^export const FEATHER_PROTOCOL_VERSION = (\d+);/m)?.[1],
    'the protocol version',
  ),
);
const protocolMin = Number(
  must(
    read('apps/inspector/src/constants/feather-protocol.ts').match(/^export const FEATHER_PROTOCOL_MIN_SUPPORTED = (\d+);/m)?.[1],
    'the minimum supported protocol version',
  ),
);

const cliVersion = json('cli/package.json').version;
const desktopVersion = json('package.json').version;
const extensionVersion = json('vscode-extension/package.json').version;

const manifest = {
  $schema: 'https://kyonru.github.io/feather/feather-platform.schema.json',
  platform,
  releasedAt: new Date().toISOString().slice(0, 10),
  // The wire contract every component in this set agreed on.
  protocol: { version: protocolVersion, minSupported: protocolMin },
  components: {
    cli: {
      version: cliVersion,
      home: 'npm',
      id: '@kyonru/feather',
      install: `npm install -g @kyonru/feather@${cliVersion}`,
      url: `https://www.npmjs.com/package/@kyonru/feather/v/${cliVersion}`,
      // The hermetic path: standalone Bun binaries, no Node toolchain needed.
      // Attached by the CLI train, which fires on this tag too. A CLI-only
      // `cli-v*` release carries the same assets under its own tag.
      requiresNode: '>=22',
      binaries: Object.fromEntries(
        [
          ['darwin-arm64', `feather-cli-darwin-arm64-${cliVersion}.bin`],
          ['darwin-x64', `feather-cli-darwin-x64-${cliVersion}.bin`],
          ['linux-x64', `feather-cli-linux-x64-${cliVersion}.bin`],
          ['windows-x64', `feather-cli-windows-x64-${cliVersion}.exe`],
        ].map(([target, file]) => [
          target,
          `https://github.com/Kyonru/feather/releases/download/v${platform}/${file}`,
        ]),
      ),
    },
    runtime: {
      version: runtimeVersion,
      home: 'luarocks',
      id: 'feather',
      install: `luarocks install feather ${runtimeVersion}`,
      url: `https://luarocks.org/modules/kyonru/feather/${runtimeVersion}-1`,
    },
    desktop: {
      version: desktopVersion,
      home: 'github-release',
      id: `v${platform}`,
      install: 'Download an installer from this release.',
      url: `https://github.com/Kyonru/feather/releases/tag/v${platform}`,
    },
    extension: {
      version: extensionVersion,
      home: 'vscode-marketplace',
      id: 'feather-cli-vscode',
      install: 'code --install-extension kyonru.feather-cli-vscode',
      url: 'https://marketplace.visualstudio.com/items?itemName=kyonru.feather-cli-vscode',
    },
  },
};

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outPath}`);

// The release body. This is the page someone lands on when they want a set that
// works, so it leads with the versions and how to get each one.
const notesIndex = process.argv.indexOf('--notes');
if (notesIndex > -1) {
  const notesPath = process.argv[notesIndex + 1];
  const c = manifest.components;
  const body = `## Feather platform v${platform}

Every component below was built and tested together. Install these versions and
they are known to work as a set — you do not need to match them up yourself.

| Component | Version | Get it |
| --- | --- | --- |
| CLI | \`${c.cli.version}\` | \`${c.cli.install}\` (needs Node ${c.cli.requiresNode}) |
| Lua runtime | \`${c.runtime.version}\` | \`${c.runtime.install}\` |
| Desktop app | \`${c.desktop.version}\` | Installers attached below |
| VS Code extension | \`${c.extension.version}\` | \`${c.extension.install}\` |

Wire protocol **v${manifest.protocol.version}** (this desktop build speaks v${manifest.protocol.minSupported}–v${manifest.protocol.version}).

\`feather doctor\` will tell you whether your installed combination matches a
published platform set.

### Attached here

Only artifacts with no other home are attached: the desktop installers and the
standalone CLI binaries. The CLI, runtime and extension live on npm, LuaRocks
and the Marketplace respectively, and are linked above rather than copied.

\`feather-platform.json\` is the machine-readable form of this table.

### Using Feather in a pipeline

The standalone CLI binaries need no Node toolchain — one download, hermetic:

\`\`\`sh
curl -fsSL -o feather \\
  https://github.com/Kyonru/feather/releases/download/v${platform}/feather-cli-linux-x64-${c.cli.version}.bin
chmod +x feather
\`\`\`

Feather drives LÖVE, so a runner also needs it (\`apt-get install -y love xvfb\`;
\`xvfb\` for anything headless that opens a window). See
[CI and automation](https://kyonru.github.io/feather/ci/) for the release gate and
the commands that make sense without a terminal.
`;
  writeFileSync(notesPath, body);
  console.log(`Wrote ${notesPath}`);
}
console.log(
  `  platform v${platform} — cli ${cliVersion}, runtime ${runtimeVersion}, ` +
    `desktop ${desktopVersion}, extension ${extensionVersion}, protocol v${protocolVersion}`,
);
