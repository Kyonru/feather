# Build Config And Safety

## Build config

Build settings live in `feather.build.json` and are loaded by `cli/src/lib/build/config.ts`.

Core fields:

- `name`, `version`, `productId`, `description`, `company`, `website`, `copyright`
- `sourceDir`, `outDir`, `include`, `exclude`, `icon`, `includeRuntime`
- `targets.web.loveJsDir`, `targets.web.title`, `targets.web.outputName`
- `targets.android.*`, including release and Fastlane settings
- `targets.ios.*`, including release and Fastlane settings
- `targets.windows|macos|linux|steamos.loveRuntimeDir`
- `upload.itch.project` and `upload.itch.channels`

Defaults and path validation are part of `loadBuildConfig()`. Keep new path fields inside the existing `projectPath()`, `assertSafeRelativePath()`, and symlink safety patterns.

## Path safety

Treat project paths as a security boundary:

- Validate user-provided relative paths with `assertSafeRelativePath`.
- Resolve project write targets with `assertSafeProjectTarget`.
- Guard output, vendor, install, and artifact paths with `assertNoSymlinkEscape`.
- Use `findSymlinkEscapes` for diagnostic scans such as doctor/security checks.

Do not use raw `join(projectDir, userValue)` for writes unless the value has already gone through these helpers.

## Build targets

Supported targets are defined in `buildTargets`:

- `love`
- `web`
- `android`
- `ios`
- `windows`
- `macos`
- `linux`
- `steamos`

Do not add target names in only one place. Command registration, config types, doctor checks, vendor handling, docs, and tests must agree.

## Release safety

- `release` and upload-with-build paths should use release mode and production safety checks.
- `--allow-unsafe` exists for build flows, but upload builds reject unsafe Feather runtime content by default.
- `upload-safety.ts` scans artifacts for Feather runtime/debugging files and blocks accidental production uploads.
- Mobile `--release` disables debugger embedding.
- Secrets belong in environment variables, not `feather.build.json`.

Production preflight belongs in shared build/release helpers, not scattered through individual platform builders. Add new release blockers to the centralized safety check so `build`, `release`, `upload`, and `doctor` stay aligned.

## Build result shape

Build flows use a plan/result pattern:

- Dry-run returns the same high-level shape as a build plan without writing artifacts.
- Real builds stage the project, produce artifacts, and write `feather-build-manifest.json`.
- Public command handlers should render either JSON or human output from the result object.
- Prefer `{ ok: true, ... } | { ok: false, error }` for build-like shared helpers so command wrappers can handle failures consistently.

## Vendor handling

Vendor templates are local project dependencies managed by `feather build vendor`.

- Web uses love.js.
- Android uses love-android.
- iOS uses love-ios and requires macOS/Xcode for builds.
- Desktop targets use local Love2D runtime vendors.

When changing vendor behavior, preserve dry-run planning, clear missing-tool errors, and configured path overrides.
