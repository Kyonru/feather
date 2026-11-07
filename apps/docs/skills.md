# Feather Agent Skills

`feather skills` installs small Feather-authored agent skills into project-local agent skill directories. Each skill is a folder with a `SKILL.md` file and optional supporting files, so Codex/Claude-style skill loaders can pick up project-specific Feather workflows from their preferred locations.

## Commands

```bash
feather skills list
feather skills list --json
feather skills info feather-step-debugging
feather skills install feather-step-debugging feather-texture-lab
feather skills install --all --dir path/to/my-game
feather skills install --all --client codex --global
feather skills install --all --client claude --global
feather skills remove feather-step-debugging --dir path/to/my-game
```

By default, project installs target `.agents/skills`, `.codex/skills`, and `.claude/skills` inside the detected project root. Use `--client agents`, `--client codex`, or `--client claude` to target only one client. Use `--global` to install into user-level skill directories such as `~/.agents/skills`, `~/.codex/skills`, or `~/.claude/skills`.

Running agents usually load skills when a session starts, not while a session is already open. Start a new Codex/Claude session after installing skills.

## Bundled Skills

| Skill | Focus |
| ----- | ----- |
| `feather-project-context` | Gather Feather config, plugins, build targets, and live-session context before editing. |
| `feather-mcp-live-sessions` | Inspect and control running desktop sessions through secure Feather MCP. |
| `feather-step-debugging` | Set breakpoints, get line context, inspect paused Lua state, step, and continue. |
| `feather-logs-observability` | Read logs, observers, assets, runtime messages, and telemetry. |
| `feather-performance-profiling` | Profile frame time, memory, overhead, and hotspots. |
| `feather-session-replay-qa` | Record, inspect, replay, seek, import, and export QA sessions. |
| `feather-shader-graph` | Create, compile, preview, import, and export Love2D shaders. |
| `feather-particle-effects` | Create, preview, tune, and export Particle Playground effects. |
| `feather-texture-lab` | Generate procedural textures, particle sprites, masks, maps, and atlases. |
| `feather-plugin-iteration` | Inspect plugin catalog/live state and invoke plugin actions. |
| `feather-debug-builds` | Run and build debug-oriented desktop, web, Android, and iOS loops. |
| `feather-release-builds` | Prepare Feather-free release builds, checks, and upload workflows. |
| `feather-qa-playtester` | Act as a QA engineer with sessions, replay, logs, debugger state, and plugins. |

## Safety

The installer only copies bundled catalog-known skills and rejects unknown IDs. Existing installed skills are skipped unless `--force` is passed, and `--dry-run` reports planned changes without writing files.

Skills point agents toward existing Feather CLI and MCP workflows. They do not bypass MCP bridge auth, Console opt-ins, API-key checks, release safety checks, or plugin capability gates.
