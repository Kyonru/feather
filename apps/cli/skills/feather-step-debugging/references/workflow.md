# Step Debugging Workflow

Use this when diagnosing Lua behavior with breakpoints, paused frames, stepping, and source context.

## Breakpoint Placement

- Read debugger state before setting breakpoints.
- Use line context for the file and candidate line.
- Place breakpoints on executable Lua lines, not comments, blank lines, table-only separators, or function headers unless the runtime can stop there.
- Prefer narrow breakpoints near the first suspicious branch, callback, or state mutation.
- Use conditions only when they are simple and side-effect free.

## Run And Step Strategy

- Continue to the breakpoint before stepping.
- Use step over for local control flow.
- Use step into when the called function is the suspected fault boundary.
- Use step out after inspecting a helper that is not the cause.
- Avoid stepping long update loops without a plan; add a more precise breakpoint instead.

## Frame Inspection

Inspect:

- Top frame file and line.
- Locals and upvalues relevant to the suspected state.
- Call stack path back to the game callback.
- Recent logs around the pause.
- Observers or plugin payloads that validate state.

Prefer debugger frame inspection over Console eval.

## Common Patterns

- Crash on callback: enable pause-on-error, inspect frame 0, then inspect caller frames.
- Wrong UI/game state: break where state is written, not where it is displayed.
- Missed input: break in input callback and then in the state transition it should trigger.
- Bad draw output: break in update first for state, then draw only if render data is wrong.

## Report Format

State the paused file/line, why that line matters, the key variable values, the call path, and the next breakpoint or code edit.
