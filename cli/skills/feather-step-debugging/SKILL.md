---
name: feather-step-debugging
description: Use when an agent needs line-aware Lua debugging with breakpoints, paused state, frame inspection, stepping, logs, and continue controls.
---

# Feather Step Debugging

## Workflow

1. Get context:
   - Use `feather_list_sessions` and `feather_debugger_state`.
   - Read `feather://sessions/{id}/debugger` and `feather://sessions/{id}/logs`.
2. Set precise breakpoints:
   - Use `feather_debugger_line_context` before setting a breakpoint so the breakpoint matches the source the runtime is executing.
   - Use `feather_debugger_set_breakpoints` with file and line data from the current project.
3. Run to the point of interest:
   - Use `feather_debugger_continue` to resume.
   - Use `feather_debugger_step_over`, `feather_debugger_step_into`, or `feather_debugger_step_out` once paused.
4. Inspect paused state:
   - Use `feather_debugger_state`, `feather_debugger_inspect_frame`, and recent logs together.
   - Prefer inspecting locals/upvalues/globals through debugger tools over Console eval.
5. Close the loop:
   - Explain the observed line, call stack, relevant variables, and next breakpoint or code edit.

## Safety

Console eval is a fallback only. Use it only when the Console plugin, `evalEnabled`, and API-key gates are already intentionally enabled.
