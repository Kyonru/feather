---
name: feather-package-catalog
description: Work on Feather's curated Love2D package catalog, packages/*.json, trust levels, checksums, registry generation, lockfile behavior, and package CLI flows.
---

# Feather Package Catalog

## When to use

Use this skill when adding or updating catalog packages, changing package trust/checksum behavior, editing package CLI flows, or working with `feather.lock.json` install/audit semantics.

## First pass

- Start with `packages/README.md` for user-facing package manager behavior.
- Inspect an existing package JSON such as `packages/anim8.json`.
- For schema and registry details, load [registry schema](references/registry-schema.md).
- For adding packages, workflows, trust, and lockfiles, load [workflows and trust](references/workflows-and-trust.md).

## Core rules

- The catalog is curated, not a general package registry.
- Catalog packages live in root `packages/*.json`; this folder already has a project meaning, so do not mix agent skills into it.
- Registry output is generated at `cli/src/generated/registry.json`; do not edit it by hand.
- Checksums must be SHA-256 values for every installed file.
- `verified` and `known` packages install normally; `experimental` and version overrides require explicit untrusted consent in CLI flows.
- Lockfiles record exact installed files and checksums so projects can restore and audit.
- Prefer pinned GitHub commit SHAs and raw HTTPS URLs for reproducibility.
- Preserve dry-run and offline behavior in package commands.

## Common implementation map

- Catalog source: `packages/*.json`.
- User docs: `packages/README.md`.
- Registry generator: `scripts/generate-registry.mjs`.
- Checksum helper: `scripts/compute-checksums.mjs`.
- Generated registry: `cli/src/generated/registry.json`.
- Package CLI entry: `cli/src/commands/package.ts` and `cli/src/commands/package/`.
- Interactive package scripts: `cli/scripts/add-package.tsx`, `add-package-url.tsx`, `update-package.tsx`, `remove-package.tsx`.

## Verification

- Add or update e2e coverage for package CLI behavior changes; use command tests or package fixtures for install, update, audit, trust, and lockfile scenarios.
- Run `npm run generate:registry` after catalog edits.
- Run `npm run check:registry` before finishing.
- Run `node scripts/compute-checksums.mjs --all` when checksums are missing or source refs changed.
- Run `npm run cli:build` if package command or generated registry consumers change.
- Test package CLI paths with `--dry-run`, `--offline`, and fixture directories where possible.

## Docs touchpoints

- Update docs for user-facing package manager behavior, trust policy, package commands, or catalog changes in the same change as the implementation.
- Update `CHANGELOG.md` for new/changed catalog entries, trust policy changes, package CLI behavior, lockfile/audit changes, or package e2e coverage changes.
- Package manager behavior belongs in `packages/README.md`.
- `docs/packages.md` points to `packages/README.md`; edit the canonical source file.
- CLI command summaries may also need `cli/README.md`.
- Trust or release-safety implications may need `docs/recommendations.md`.
- Prefer source-side package docs under `packages/`, exposed through `docs/` with symlinks when practical.

## Avoid

- Do not add packages from unpinned or private sources to the curated catalog.
- Do not make `--yes` bypass untrusted-source consent.
- Do not write package files outside user-selected safe project paths.
- Do not remove lockfile audit guarantees for convenience.
