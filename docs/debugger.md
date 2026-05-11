# Step Debugger

The step debugger lets you pause game execution at any line, inspect local variables and the call stack, and resume with continue, step over, step into, or step out — all from the **Debugger** tab in the Feather desktop app.

It also hosts Feather's opt-in [Hot Reload](hot-reload.md) controls for selected Lua modules.

> [!WARNING]
> Hot reload sends Lua source from the app into the running game. Enable it only in trusted development sessions with a narrow module allowlist.

---

## Setup

### With auto.lua

The debugger is controlled by the `debugger` config option, not the plugin system. Enable it in auto setup:

```lua
require("feather.auto").setup({
  debugger = true,
})
```

### Manual setup

```lua
local debugger = FeatherDebugger({
  debug    = true,
  debugger = true,   -- install the debug hook on startup
})

function love.update(dt)
  debugger:update(dt)
end
```

You can also leave `debugger = false` and toggle it on from the **Debugger** tab in the desktop app at any time without restarting the game.

---

## Setting breakpoints

1. Open the **Debugger** tab.
2. Browse your source files in the file tree on the left.
3. Click any **line number** to add a breakpoint. Click again to remove it.

Breakpoints are shown as red dots in the gutter. They persist across desktop restarts and are synced to the game whenever the debugger is enabled or a breakpoint is changed.

### Conditional breakpoints

Right-click a breakpoint (or use the condition field) to add a Lua expression. The game only pauses when the expression evaluates to truthy:

```lua
-- Only pause when the player takes damage
player.health < 50

-- Only pause on a specific enemy
enemy.id == "boss_1"

-- Pause on the 10th iteration
i == 10
```

The condition runs in the game's Lua context, so you can reference any global or local variable visible at that line.

---

## While paused

When execution stops at a breakpoint, the desktop shows:

### Call stack

The full stack trace — file, line, and function name for each frame. Click a frame to navigate to it in the source view. The highlighted frame is where execution is suspended.

```
main.lua:42     love.update
player.lua:18   Player:update
player.lua:55   Player:applyGravity   ← paused here
```

### Variables

Locals and upvalues of the currently selected frame, expanded one level deep for tables:

```
dt          = 0.016
self        = { x = 142, y = 320, health = 75, state = "jumping", … }
velocity    = { x = 2.5, y = -8.1 }
onGround    = false
```

### Controls

| Button | Shortcut | Description |
| --- | --- | --- |
| Continue | `F8` | Resume freely until the next breakpoint |
| Step Over | `F10` | Execute the next line; don't follow function calls |
| Step Into | `F11` | Follow the next function call into its body |
| Step Out | `⇧F11` | Run until the current function returns |

---

## Typical workflow

1. **Reproduce the bug** — run the game and trigger the condition.
2. **Set a breakpoint** — on the line you suspect, or just before the crash.
3. **Pause** — the game freezes; desktop shows variables and call stack.
4. **Inspect** — read locals and upvalues to understand the state.
5. **Step** — use Step Over to walk through logic line by line.
6. **Continue** — resume and wait for the next pause.

### Example: tracking down a wrong jump height

```lua
-- player.lua, line 55
function Player:applyGravity(dt)
  if self.onGround then
    self.velocity.y = self.jumpForce   -- ← breakpoint here
  end
  self.velocity.y = self.velocity.y + GRAVITY * dt
  self.y = self.y + self.velocity.y * dt
end
```

With a breakpoint on line 55, pause and check:

- `self.jumpForce` — is it the expected value?
- `self.onGround` — is the condition entering correctly?
- `GRAVITY` — is it the global constant you expect?

Step Over line by line to watch `self.velocity.y` and `self.y` update in real time.

---

## Mobile / remote source files

> [!IMPORTANT]
> If the game is running on a mobile device or in an environment where the desktop can't access the source files directly, click **Open folder** in the file tree header and select the directory where your `.lua` files live. The debugger will read files from there for display.

---

## How it works

Lua's `debug.sethook` line hook fires on every executed line. When a breakpoint or step condition is met, `love.update` blocks in a tight poll while the WS client keeps pumping — so the desktop stays connected and commands (continue, step) can arrive. Resuming any step command unblocks the loop and reinstalls the hook for the next pause.

> [!NOTE]
> `debug.sethook` adds a small overhead to every executed Lua line. It is noticeable in CPU-heavy games. Enable the debugger only during active debugging sessions and disable it from the desktop when not in use.

---

## Integration with Time Travel

If the **Time Travel** plugin is recording when a breakpoint fires, Feather automatically pushes the frame buffer to the desktop. The debugger toolbar shows a **Time Travel (N frames)** button — clicking it navigates to the [Time Travel](time-travel.md) timeline, pre-loaded with the observer history leading up to the pause.

This lets you scrub backwards from a crash without re-running the game.
