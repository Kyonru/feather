---
name: feather-debug-builds
description: Use when an agent should prepare or run debug-oriented Feather builds for desktop, web, Android, iOS, or Steam Deck development.
---

# Feather Debug Builds

## Workflow

1. Check prerequisites:
   - Run `feather doctor <dir> --build-target <target> --json`.
   - Inspect `feather.build.json` and target vendor paths.
2. Prefer development commands:
   - Desktop: `feather run <dir>`.
   - Web: `feather run <dir> --target web`.
   - Android: `feather run <dir> --target android`.
   - iOS: `feather run <dir> --target ios`.
   - Continuous device loops: `feather watch <target> --dir <dir>`.
3. Add vendors when missing:
   - `feather build vendor add web|mobile|desktop|all --dir <dir>`.
4. Keep debug and release separate:
   - Debug builds may embed Feather runtime and selected plugins.
   - Release builds should use release commands and production checks.

## Output

Give exact commands, missing tools, expected artifact paths, and whether the build includes Feather runtime/debug support.

## References

- Read `references/workflow.md` for target-specific debug commands, vendor setup, device loops, and troubleshooting.
