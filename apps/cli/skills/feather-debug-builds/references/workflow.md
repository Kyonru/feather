# Debug Builds Workflow

Use this when preparing or running debug-oriented Feather builds for desktop, web, Android, iOS, or Steam Deck development.

## Prerequisites

- Run `feather doctor <dir> --build-target <target> --json`.
- Inspect `feather.build.json` and configured vendor paths.
- Confirm platform tools: LOVE, web vendor, Android SDK/ADB, Xcode/xcrun, desktop packaging tools.
- Keep debug and release commands separate.

## Commands By Target

- Desktop run: `feather run <dir>`.
- Web run: `feather run <dir> --target web`.
- Android run: `feather run <dir> --target android`.
- iOS run: `feather run <dir> --target ios`.
- Continuous loop: `feather watch <target> --dir <dir>`.
- Add vendors: `feather build vendor add web|mobile|desktop|all --dir <dir>`.

## Debug Artifact Expectations

Debug builds may include Feather runtime support and selected plugins. State this clearly when reporting artifacts.

Expected outputs depend on target and vendor configuration. Give exact paths from command output when available, not guessed paths.

## Troubleshooting

- Missing vendor: add the relevant vendor, then rerun doctor.
- Device not found: check ADB or simulator tooling.
- Stale app on device: reinstall or rerun watch target.
- Runtime bridge unavailable: confirm desktop app, session, and plugin settings.
- Build succeeds but game fails: switch to logs/session inspection rather than rebuilding repeatedly.

## Output

Include exact command, target, missing prerequisites, artifact path, runtime/debug inclusion, and next command.
