# Project Context Workflow

Use this when a task needs project facts before edits, runtime actions, build work, or QA.

## Inventory Checklist

- Locate project root from the user's cwd or `--dir` target.
- Read local instructions first: `AGENTS.md`, `.codex/skills`, and project docs relevant to the requested subsystem.
- Inspect Feather files when present: `feather.config.lua`, `feather.build.json`, `feather.lock.json`, `plugins/`, `packages/`, and generated build/vendor folders.
- Run `feather doctor <dir> --json` when the CLI is available and the task is not just a quick explanation.
- For build or release work, add `--build-target <target>` and/or `--production`.
- Use `git status --short` before edits and keep unrelated user changes intact.

## Runtime Context

If the desktop bridge is available:

- List sessions before assuming a game is running.
- Read config, plugins, logs, performance, debugger, assets, observers, and session replay only as needed.
- Refresh stale sections before diagnosing live behavior.

If no session exists, continue from local files and report that live runtime facts were unavailable.

## Risk Posture

Call out these facts early:

- Console, Hot Reload, filesystem, network, or weak API-key settings.
- Release path versus debug path.
- Embedded Feather runtime/debug files in artifacts.
- Missing vendors, SDKs, signing credentials, or device tools.
- Generated files that must be regenerated rather than hand-edited.

## Report Template

Use this order:

1. Project root and launch/build command.
2. Feather config and installed plugin/package posture.
3. Connected session status.
4. Risky opt-ins or release blockers.
5. Smallest next action.
