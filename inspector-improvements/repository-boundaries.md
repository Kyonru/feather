# Repository and release-boundary hygiene

> Status (2026-10-16): implemented except owner-only release proof. This is the original audit; see [README.md](./README.md#current-disposition) for the reconciled status.

## Goal

Finish the v4 move operationally: source paths, package metadata, workspace configuration, agent
guidance, and CI assertions should all describe the same repository.

## Findings

### 1. Active agent instructions still name generated files at old paths (`P1`)

`AGENTS.md` correctly describes the new `apps/*` layout but its package workflow and generated-file
table still reference `cli/src/generated/*`. Those files now live at `apps/cli/src/generated/*`.

### 2. Repo-local skills are broadly pre-move (`P1`)

The CLI, extension, plugin, package, and runtime skills and references repeatedly direct agents to
`cli/*`, `vscode-extension/*`, and `docs/*`. Following them causes failed reads and, in scripts,
can recreate directories at obsolete locations. This already manifested in the extension dev
launcher.

### 3. Package repository metadata is stale (`P1`)

`apps/cli/package.json` declares repository directory `cli`; the extension declares
`vscode-extension`. Both should include `apps/` so npm/Marketplace source links resolve correctly.

### 4. Root workspace metadata is stale (`P2`)

The root `package.json` `workspaces` array still lists `cli` and `vscode-extension` and omits the
current package set. pnpm uses `pnpm-workspace.yaml`, so installs work, but other tooling and readers
can consume `package.json`. The YAML comment still says bare catalog JSON shares `packages/`, even
though the catalog moved to `catalog/packages/`.

### 5. Architecture documentation contains contradictory live acceptance text (`P2`)

The retired v4 plan deliberately preserved historical paths in its diagnosis; that record remains
available in git history and should stay historical.
But live verification/examples and the Phase 05 “Done when” text include stale paths or say each app
exposes a distinct MCP server, while decision D32 says one agent-facing server routes to two
app-owned backends. Historical record and current instruction need clearer labeling.

### 6. CI/Turbo descriptions and execution differ (`P2`)

V4 says build/test workflows invoke the Turbo graph, while several workflows call root scripts
directly. `turbo.json` has useful root tasks, but some generic task inputs are Inspector-biased and
the repository largely invokes the `//#...` tasks explicitly. The actual caching/affected-work
contract should be documented and tested rather than inferred.

### 7. Boundary checks are asymmetric (`P2`)

The artifact guard protects Inspector/Studio code separation. Equivalent checks do not currently
guard obsolete source roots, package repository metadata, skill paths, generated launcher imports,
or all generated-file documentation.

## Proposed cleanup

### One path migration check

Add a script with an allowlist for historical passages. Fail active source/config/instructions on:

- imports or filesystem references to removed root `cli/`, `vscode-extension/`, `src/`, or `docs/`;
- stale `repository.directory` metadata;
- generated-file tables that omit `apps/`;
- broken docs symlinks;
- a prepared dev launcher that cannot resolve its target.

Do not blindly replace paths in changelog/history sections; that would falsify old releases.

### Canonical workspace inventory

Keep the package list in `pnpm-workspace.yaml` canonical. Either remove root `workspaces` if no tool
needs it, or generate/check it from the pnpm file. Update comments when moves land.

### Separate current rules from historical record

Add a small “Current architecture” block near the top of V4 and mark baseline/historical code paths
as such. Resolve the MCP wording to:

> one configured MCP gateway; two independently owned and authenticated app backends.

### Make release ownership executable

For every tag train, test the expected workflow/artifact set without publishing. Verify package
versions and `repository.directory` against the train. Keep external push/sign/notarization proofs
as explicit follow-ups where local CI cannot prove them.

## Acceptance

- No active instruction or executable source references a removed root app path.
- Historical docs/changelog remain historically accurate and are explicitly labeled.
- Root workspace metadata agrees with `pnpm-workspace.yaml`, or is removed.
- npm and VSIX source metadata links to `apps/cli` and `apps/vscode-extension`.
- Prepared extension launcher resolves and executes in CI.
- V4 uses one unambiguous MCP ownership phrase in goals, success criteria, phase completion, and
  glossary.
- Turbo task inputs are tested against representative app/package changes.
- Artifact and obsolete-path checks run in `verify` and release workflows.

