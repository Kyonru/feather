# Workflows And Trust

## Trust levels

- `verified`: Feather-reviewed, pinned release, per-file SHA-256.
- `known`: popular community library, checksum-pinned, not audited in depth.
- `experimental`: custom installs, direct URLs, or version overrides. Requires explicit untrusted consent for CLI flows.

Version overrides such as `anim8@v2.2.0` are experimental even when the package source is curated.

## User lockfile

Project installs write `feather.lock.json` in the user's game project. It records:

- package name
- version/source selection
- trust level
- installed file paths
- file URLs
- SHA-256 hashes
- resolved commit SHA for repo installs when available

`feather package install` with no package restores from the lockfile. `feather package audit` verifies installed files against the lockfile.

## Package commands

- `feather package search [query]`
- `feather package list`
- `feather package info <name>`
- `feather package install`
- `feather package install <name> [name2...]`
- `feather package install <name>@<version>`
- `feather package add`
- `feather package install --from-url <url> --target <path>`
- `feather package update [name]`
- `feather package remove <name>`
- `feather package audit`

## Adding a catalog package

Use the package helpers instead of hand-writing entries from scratch:

- `npm run package:add` for GitHub-hosted packages.
- `npm run package:add-url` for direct file URL packages.

The wizard should produce `packages/<id>.json` and regenerate `cli/src/generated/registry.json`. Commit both when the diff is expected.

Checklist:

- Prefer tagged releases or pinned commits; avoid moving branches for curated packages.
- Keep install targets narrow, usually under `lib/<package-id>/`.
- Include a realistic `require` path and example so users can verify the install.
- Use `verified` only when the source is reviewed, pinned, and checksum-covered; otherwise choose `known` or `experimental`.
- Recompute checksums when file URLs, pinned refs, or target files change.
- Verify with `npm run check:registry`, `npm run cli:build`, `npm run feather -- package info <id>`, and `npm run feather -- package install <id> --dir <temp-game>`.
- Add or update package e2e coverage for install, update, audit, trust, lockfile, or CLI flow changes.
- Update `packages/README.md` and `CHANGELOG.md` for new or changed user-visible catalog entries.

## Safety expectations

- Custom URL installs require `--allow-untrusted`.
- `--yes` should not imply trust.
- Offline mode should use the bundled registry snapshot.
- Dry-run mode should report intended writes without modifying project files.
- Audit failures should identify missing or modified files clearly.
- Install/update/remove flows should validate project-relative target paths with CLI path-safety helpers.
- JSON output should be redaction-safe and stable enough for automation.
