# Commands And Verification

## Command surface

- `feather create <project-name>` scaffolds a full Love2D project from a template, runs `feather init`, and optionally installs plugins, packages, and vendors in one flow.
- `feather run` injects Feather into a Love2D game and launches desktop, web, Android, or iOS targets.
- `feather init` creates project config and defaults to CLI-managed mode.
- `feather watch` restarts desktop Love2D or pushes rebuilt artifacts to mobile targets on change.
- `feather doctor` checks project setup, production safety, packages, vendors, and target dependencies.
- `feather config` edits `feather.config.lua` plugin/include/hot-reload settings.
- `feather plugin` manages bundled or installed plugin files and include/exclude state.
- `feather package` installs and audits curated Love2D libraries.
- `feather replay` creates a session replay adapter.
- `feather build` creates `.love`, web, mobile, and desktop artifacts.
- `feather build vendor` fetches and inspects local vendor templates.
- `feather release` wraps mobile release build and optional Fastlane lanes.
- `feather upload` uploads existing or freshly built artifacts.

## Source map

- `cli/src/index.ts`: Commander command tree and option parsing.
- `cli/src/commands/create.ts`: project scaffold pipeline — template clone, identity derivation, git history reset, Feather init, optional plugin/package/vendor setup. Interactive options come from `cli/src/ui/create-workflow.js`.
- `cli/src/commands/run.ts`: run flow and target dispatch.
- `cli/src/commands/init.ts`: generated config and embedded integration setup.
- `cli/src/commands/watch.ts`: watch mode.
- `cli/src/commands/doctor.ts`: diagnostics and production checks.
- `cli/src/commands/config.ts`: config editing commands.
- `cli/src/commands/build.ts`: build target command.
- `cli/src/commands/build-vendor.ts`: vendor commands.
- `cli/src/commands/release.ts`: release flow.
- `cli/src/commands/upload.ts`: upload flow.
- `cli/src/commands/package.ts` and `cli/src/commands/package/`: package manager commands.

## Adding a CLI feature

- Add or extend command registration in `cli/src/index.ts` only after locating the existing command shape and option conventions.
- Put command behavior in `cli/src/commands/*` and shared reusable logic in `cli/src/lib/*`.
- Preserve automation paths: add `--json` for structured output where useful, `--dry-run` for write/build/upload flows, and non-interactive flags for prompt-based flows.
- Route user-facing output through `cli/src/lib/output.ts` and use `printJson()` for JSON so redaction still applies.
- Add doctor or production-safety checks when the feature changes setup, release contents, runtime injection, packages, vendors, or native target requirements.
- Add CLI e2e coverage in `cli/test/commands/*.test.mjs`; include fixture projects for file-writing commands.
- Update `cli/README.md`, any relevant `docs/` symlink target, and `CHANGELOG.md`.
- Run `npm run cli:build`, targeted command tests, and smoke checks through `npm run feather -- <command> --help`.

## `feather create` design notes

`feather create <project-name>` runs a pipeline defined in `runCreatePipeline`:

1. Resolve the template ref (latest GitHub release by default; `--main` or `--ref <tag>` override).
2. Clone the template repo with `git clone --depth=1`.
3. Clean template artifacts and apply project identity (slug, title, productId, `.env` values).
4. Reset git history (`rm .git` + `git init`), commit cleaned template.
5. Call `feather init` in CLI-managed mode with `yes: true` (suppresses interactive prompts and the banner).
6. Optionally install plugins, packages, and vendors selected interactively or via flags.
7. Commit Feather configuration.

Key rules for changes to `create`:

- `runCreatePipeline` accepts injected `deps` for all external calls (git, init, installPlugins, installPackages, addVendors, fetchLatestReleaseTag). Use these seams for unit tests — do not add raw external calls outside the deps pattern.
- All project-relative writes must go through `assertSafeProjectTarget`; never use raw `join(projectDir, userValue)`.
- `--yes` skips interactive options and the banner. When `create` calls `initCommand` internally it passes `yes: true`, so the banner prints once (from `create`) not twice.
- The only supported template is `DEFAULT_CREATE_TEMPLATE` (`Oval-Tutu/bootstrap-love2d-project`). New templates require a matching `TemplatePipeline` implementation and a `resolvePipeline` entry.
- Optional steps (plugin install, package install, vendor add) use `runOptionalStep` so a failure in one step does not abort the project creation.
- `deriveProjectIdentity` and `resolveCreateTarget` are pure functions and should stay testable without filesystem or network access.

## Verification commands

- `npm run cli:build`: compile CLI TypeScript and copy generated registry.
- `node --test cli/test/commands/*.test.mjs`: CLI command tests.
- `npm run test:cli:e2e`: root wrapper for CLI build plus command tests.
- `npm run test:lua:e2e`: Lua runtime examples and plugin checks.
- `npm run check:plugin-catalog`: regenerate plugin catalog and fail on diff.
- `npm run check:registry`: regenerate package registry and fail on diff.

## Output conventions

- Support `--json` for automation when a command reports structured state.
- Support `--dry-run` for commands that normally write files, invoke native tooling, upload, or fetch vendors.
- Suppress spinners for JSON, dry-run, and verbose output so logs stay machine-readable.
- Route human output through `cli/src/lib/output.ts`; it redacts sensitive text and values.
- Use `printJson()` rather than `console.log(JSON.stringify(...))` so secrets are redacted.
- Keep errors actionable: include the missing command, config field, path, or remediation command.

## Docs update rules

Update docs whenever a user-facing command, option, config field, build behavior, or safety check changes.

- CLI docs: `cli/README.md` (symlinked to `docs/cli.md` — edit the source file).
- Config reference: `docs/configuration.md`.
- Build and target docs: `docs/usage.md`, `docs/installation.md`.
- Packages docs: `docs/packages.md`.

When adding a new command option or changing default behavior, update the relevant `README.md` and the matching `docs/` page in the same change.

## Local smoke checks

Use `npm run feather -- <args>` after `npm run cli:build`:

```bash
npm run feather -- --help
npm run feather -- init --help
npm run feather -- build --help
npm run feather -- package list --offline
```

Prefer `--dry-run`, `--json`, and fixture project directories when testing commands that normally write user project files.
