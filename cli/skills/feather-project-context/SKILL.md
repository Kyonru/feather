---
name: feather-project-context
description: Use when an agent needs to understand a Feather Love2D project before making code, runtime, plugin, MCP, build, or QA changes.
---

# Feather Project Context

## Workflow

1. Identify the project root and whether Feather is CLI-managed:
   - Read `feather.config.lua`, `feather.build.json`, `feather.lock.json`, and any local `AGENTS.md`.
   - Run `feather doctor <dir> --json` when available for a structured health report.
2. Check runtime and plugin posture:
   - Use `feather plugin list <dir>` for installed plugins.
   - Confirm Console, Hot Reload, filesystem, and network features are explicitly enabled before relying on them.
3. If the desktop app is running, prefer MCP for live facts:
   - Use `feather://sessions`, `feather_session_snapshot`, and section resources for `config`, `logs`, `performance`, `debugger`, `plugins`, `assets`, and `observers`.
4. Keep release safety in mind:
   - Use `feather doctor <dir> --production --json` before release-facing changes.
   - Do not embed Feather debugger/runtime content in release builds unless the user explicitly asks for a development artifact.

## Output

Report concrete project facts first: launch command, session status, enabled plugins, risky opt-ins, build targets, and the smallest next action.

## References

- Read `references/workflow.md` for the project inventory checklist, risk posture, and report template.
