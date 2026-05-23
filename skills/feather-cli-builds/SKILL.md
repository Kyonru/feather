---
name: feather-cli-builds
description: Work on Feather CLI commands, run/init/watch/build/release/upload/doctor flows, build config, native vendor handling, release safety, and CLI verification.
---

# Feather CLI And Builds

## When to use

Use this skill when changing or reviewing Feather CLI behavior, command options, build targets, native vendor workflows, release/upload flows, doctor checks, or CLI tests.

## First pass

- Start with `cli/src/index.ts` to see the Commander command surface and option names.
- Follow command handlers into `cli/src/commands/` and shared behavior into `cli/src/lib/`.
- For build or upload work, load [build config and safety](references/build-config-and-safety.md).
- For command behavior, tests, and scripts, load [commands and verification](references/commands-and-verification.md).

## Core rules

- Preserve the public `feather` command shape unless the task explicitly asks for a breaking change.
- Prefer adding behavior in `cli/src/commands/*` and reusable helpers in `cli/src/lib/*`.
- Keep command options consistent across `run`, `watch`, `build`, `release`, and `upload`; aliases such as `--build-config` and `--disable-debugger` exist for compatibility.
- CLI-managed mode is the default for `feather init`; embedded `auto` and `manual` modes are escape hatches.
- Treat `feather.config.lua`, `feather.build.json`, and `feather.lock.json` as user project files. Validate and write them deliberately.
- Keep release builds clean by default: release/mobile upload paths should not embed the debugger runtime unless explicitly allowed for internal builds.
- Keep path handling inside the existing path-safety helpers. Do not introduce raw path joins for user-provided output, install, or vendor paths without safety checks.
- Prefer JSON output compatibility when a command already supports `--json`.

## Common implementation map

- Command registration: `cli/src/index.ts`.
- CLI command handlers: `cli/src/commands/`.
- Runtime config parsing/writing: `cli/src/lib/config.ts`.
- Build config and targets: `cli/src/lib/build/config.ts`.
- Build staging and artifacts: `cli/src/lib/build/build.ts`, `cli/src/lib/build/files.ts`, `cli/src/lib/build/debug-stage.ts`.
- Platform builders: `cli/src/lib/build/web.ts`, `android.ts`, `ios.ts`, `desktop.ts`.
- Vendor fetching/listing: `cli/src/lib/build/vendor.ts`.
- Release and upload: `cli/src/lib/build/release.ts`, `upload.ts`, `upload-safety.ts`.

## Verification

- Add or update CLI e2e coverage for command behavior changes; prefer `cli/test/commands/*.test.mjs` for CLI command scenarios.
- Build CLI after code changes: `npm run cli:build`.
- Run CLI command tests: `node --test cli/test/commands/*.test.mjs`.
- Use root wrapper for local command smoke checks: `npm run feather -- --help`.
- For Lua/runtime impact, also run `npm run test:lua:e2e`.
- For package catalog side effects, also run `npm run check:registry`.

## Docs touchpoints

- Update docs for user-facing CLI behavior in the same change as the implementation.
- Update `CHANGELOG.md` for user-visible command, option, build, release, upload, doctor, safety, or e2e coverage changes.
- User-facing CLI behavior belongs in `cli/README.md`; `docs/cli.md` points there.
- Build, release, upload, and production-safety behavior may also need `docs/recommendations.md`.
- Configuration fields may need `docs/configuration.md`.
- When a docs page can live beside the CLI source, keep the canonical file in `cli/` and expose it through `docs/` with a symlink.

## Avoid

- Do not add a new workspace package for CLI-only changes.
- Do not bypass production safety checks with silent fallbacks.
- Do not make network, filesystem, or native tool failures vague; CLI errors should tell the user what command or config fixes the issue.
