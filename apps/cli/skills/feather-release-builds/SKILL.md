---
name: feather-release-builds
description: Use when an agent should prepare production-safe Feather-free artifacts, release builds, upload checks, or mobile store workflows.
---

# Feather Release Builds

## Workflow

1. Run production safety checks:
   - `feather doctor <dir> --production --json`
   - Add `--build-target <target>` for platform-specific checks.
2. Build release artifacts:
   - `feather build android --dir <dir> --release`
   - `feather build ios --dir <dir> --release`
   - `feather build windows|macos|linux|steamos --dir <dir>`
3. Use release helpers when configured:
   - `feather release init --dir <dir>`
   - `feather release ios beta|production --dir <dir>`
   - `feather release android beta|production --dir <dir>`
4. Upload only safe artifacts:
   - `feather upload itch <target> --dir <dir> --build`
   - Ensure generated manifests do not include Feather runtime/debug files unless the user intentionally allows an existing artifact.

## Guardrails

Never carry Console, Hot Reload, weak API keys, insecure networking, or embedded debugger runtime into a release path without calling it out as a blocker.

## References

- Read `references/workflow.md` for production gates, platform release commands, upload checks, artifacts, and blocker reporting.
