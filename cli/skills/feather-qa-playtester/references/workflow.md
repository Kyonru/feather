# QA Playtester Workflow

Use this when acting as a QA engineer for a Feather-enabled Love2D game.

## Test Charter

Define:

- Platform and build command.
- Scene or save state.
- User workflow under test.
- Expected behavior.
- Pass/fail signal.
- Tools available: live session, replay, logs, debugger, observers, plugins, device automation.

## Evidence Collection

Prefer evidence in this order:

1. Repro steps or replay.
2. First visible failure.
3. Logs around the failure.
4. Observer or plugin state that confirms the failure.
5. Performance data if timing-related.
6. Debugger frame if a code path is implicated.

Use platform/device automation only when tools are present and approved.

## Severity

- Critical: crash, data loss, security/release blocker.
- High: broken core flow, hang, severe performance regression.
- Medium: visible incorrect behavior with workaround.
- Low: cosmetic issue, minor polish, unclear impact.

## Bug Report Format

Include:

- Title.
- Environment/platform/build.
- Steps to reproduce.
- Expected result.
- Actual result.
- Evidence: session id, replay id/time, logs, observers, screenshots if available.
- Severity and suspected area.
- Verification step after fix.

## Regression Verification

After a fix, rerun the same steps or replay segment. Report pass/fail and any remaining risk.
