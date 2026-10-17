# CI and automation

Feather works in a pipeline, but not all of it does. This page covers what to
install, which commands make sense without a terminal, and where the release
gate goes.

## Pick an install path

=== "Standalone binary (hermetic)"

    No Node toolchain, one download. This is usually what you want on a lean
    runner. Binaries are attached to every CLI release, so you can pin an exact
    version — including a CLI-only patch.

    ```sh
    curl -fsSL -o feather \
      https://github.com/Kyonru/feather/releases/download/v4.0.0/feather-cli-linux-x64-4.0.0.bin
    chmod +x feather
    ./feather --version
    ```

    Available targets: `linux-x64`, `darwin-arm64`, `darwin-x64`, and
    `windows-x64` (`.exe`).

=== "npm"

    Requires **Node 22 or newer** — the package declares that engine.

    ```sh
    npm install -g @kyonru/feather@4.0.0
    ```

Pin the version either way. Feather releases each component on its own train, so
`@kyonru/feather@4.0.0` is independent of the desktop app and runtime versions.

!!! tip "Which versions work together"

    Every `v*` release publishes `feather-platform.json` listing the CLI, Lua
    runtime, desktop app and extension versions that were built and tested as a
    set, with the wire protocol version. Pin from there and you do not have to
    match components up yourself. `feather doctor` reports whether your local
    combination matches.

## Install LÖVE

Feather drives LÖVE; it does not replace it. A runner needs it too, plus `xvfb`
for anything headless that opens a window.

```sh
sudo apt-get update
sudo apt-get install -y love xvfb
```

## Commands that belong in CI

| Command | Use |
| --- | --- |
| `feather doctor --production --json` | The release gate. See below. |
| `feather build <platform>` | Produce a shippable artifact. |
| `feather upload --yes` | Ship it. |
| `feather package install` | Restore Love2D dependencies from the lockfile. |
| `feather package audit` | Verify installed package checksums. |

`build` takes a platform **subcommand**, not a flag: `love`, `web`, `android`,
`ios`, `windows`, `macos`, `linux`, `steamos`.

```sh
feather build linux
feather build android
```

## Commands that do not

`feather run` and `feather watch` expect a live game process and a Feather
desktop app on the other end of the WebSocket. Neither exists on a build runner,
so they will not do anything useful there. Use them locally.

## The release gate

`doctor --production` is the check to fail a pipeline on. It fails when the
project is configured in a way that should not ship:

- unsafe or development-oriented config,
- an embedded debug runtime in a release build,
- hot reload persisting to disk,
- Console exposed,
- replay and debug artifacts left in the tree,
- missing signing or upload dependencies for the target you asked about.

```sh
feather doctor --production --json > doctor.json || {
  echo "Feather production checks failed"
  cat doctor.json
  exit 1
}
```

Add `--target <platform>` to include build and upload dependency checks for that
platform, and `--release` with it for mobile release signing checks.

For a security-focused report, `feather doctor --security --json` emits a
sterile report with no secrets in it — safe to archive as a build artifact.

## Run non-interactively

The CLI has an Ink-based interface for humans. In a pipeline it needs to be told
not to wait for anyone:

- **Pass `--yes` to anything destructive.** These refuse to proceed without it
  when there is no TTY, rather than guessing:

    | Command | Without `--yes` |
    | --- | --- |
    | `feather upload` | Refuses, and requires an explicit target |
    | `feather remove` | Refuses to remove Feather files |
    | `feather package remove` | Refuses |
    | `feather plugin remove` | Refuses |

    That refusal is deliberate. It is what stops a pipeline silently deleting a
    runtime or a dependency.

- **`package install` has its own gate.** Installing an experimental or
  unreviewed source needs `--allow-untrusted` non-interactively, and repairing
  lockfile entries does too. A pipeline that hits this should be fixed by
  reviewing the package, not by adding the flag reflexively.
- **Prefer `--json` where it exists** (`doctor`, `upload`, `init`) so a step can
  parse the result instead of scraping human output.
- **`package install --dry-run`** reports what would change without writing, which
  is useful as a drift check on a pull request.

## A worked example

```yaml
name: Ship

on:
  push:
    tags: ["game-v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install LÖVE
        run: sudo apt-get update && sudo apt-get install -y love xvfb

      - name: Install Feather
        run: |
          curl -fsSL -o /usr/local/bin/feather \
            https://github.com/Kyonru/feather/releases/download/v4.0.0/feather-cli-linux-x64-4.0.0.bin
          chmod +x /usr/local/bin/feather

      - name: Restore Love2D dependencies
        run: feather package install

      - name: Verify package checksums
        run: feather package audit

      - name: Production checks
        run: feather doctor --production --target linux --json

      - name: Build
        run: feather build linux
```
