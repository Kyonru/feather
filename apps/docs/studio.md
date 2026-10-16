# Feather Studio

Feather Studio is the creative half of Feather: the shader graph, the texture
lab and the particle playground. It is a **separate application** from Feather
Inspector, with its own installer, its own updates and its own version.

## Why it is separate

Inspector is a debugger. It attaches to a running game, streams logs and
performance, and holds a live session. Studio is an editor. It makes shaders,
textures and particle systems, and none of that needs a game running at all.

Keeping them apart means a Studio update does not make you reinstall your
debugger, and a debugger fix does not touch your creative tools. It also means
you can install only what you use.

## Installing

Studio and Inspector install independently. Neither requires the other.

- **Feather Inspector** — from a `v*` release on the
  [releases page](https://github.com/Kyonru/feather/releases).
- **Feather Studio** — from a `studio-v*` release on the same page.

Studio also runs in a browser with no install at all, at
[the showcase](https://kyonru.github.io/feather/standalone-showcase/). The
browser build is the same tools, minus anything that needs a local game.

## Using Studio on its own

This is the normal case, and everything works:

- author shader graphs, generate textures, build particle systems
- save and load projects from disk
- keep named workspaces, saved recipes and timeline settings

The workspace name in the top strip is shared by all three tools. Use it to
create, switch or rename workspaces; Studio saves changes as you work. Deleting
a workspace removes its shader graph, particle composites and texture recipes,
so Studio asks for confirmation first and always keeps at least one workspace.

Existing per-tool work is adopted by the first workspace after upgrading rather
than replaced with an empty one.

Studio says *"Local only"* when no Inspector is running. That is a state, not
an error.

## Pairing with Inspector

Connecting lets you push work straight into a running game — a shader, a
particle system, a texture — and see it live.

1. Start Feather Inspector and attach your game as usual.
2. In Studio, open the tools menu and choose **Connect Inspector**.
3. If Inspector has several games attached, choose the game that should receive
   previews. Studio never guesses between multiple sessions.

Pairing is explicit. Studio never searches for Inspector on its own.

### What pairing does

- **Version check first.** The two applications release separately, so they
  negotiate before anything else. If they cannot agree, Studio says which one to
  update rather than failing later in a confusing way.
- **A short-lived key.** Inspector issues a capability that Studio presents on
  every request. It expires, and Inspector can revoke it.
- **Local only.** The connection is loopback; nothing is reachable from your
  network.
- **Scoped preview.** A pairing sends only the creative preview actions it was
  granted, and only to the selected game. Restarting that game makes the old
  preview stale until Studio sends it to the new session.
- **Local work stays local.** Disconnecting removes live preview but keeps the
  active workspace and all of its saved work.

### Moving your settings across

If you used the creative tools when they lived inside Inspector, your texture
recipes, saved workspaces and timeline settings are still there. The first time
you pair, Studio offers to bring them over.

The copy in Inspector is **not deleted**. If anything goes wrong you still have
it, and you can pair again later — importing twice is harmless.

If you never pair, Studio simply starts empty.

## Agents and MCP

There is one Feather MCP server, not two. `feather mcp` serves both
applications: session and debugging tools come from Inspector, creative tools
from Studio. Configure it once.

If an application is not running, its tools say so by name rather than failing
with a connection error.

```sh
feather mcp setup --client claude
```
