# Feather Agent Skills

`feather skills` installs small Feather-authored agent skills into a project-local `.agents/skills` directory. Each skill is a folder with a `SKILL.md` file and optional supporting files, so Codex/Claude-style skill loaders can pick up project-specific Feather workflows.

## Commands

```bash
feather skills list
feather skills list --json
feather skills info feather-step-debugging
feather skills install feather-step-debugging feather-texture-lab
feather skills install --all --dir path/to/my-game
feather skills install feather-shader-graph --target .codex/skills
feather skills remove feather-step-debugging --dir path/to/my-game
```

The default install target is `.agents/skills` inside the detected project root. Use `--dir` to resolve the project root from a specific directory, and `--target` to install somewhere else inside that project.

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
