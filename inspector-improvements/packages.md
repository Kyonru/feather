# Package management architecture

## Goal

Make package operations atomic, ownership-aware, reproducible, and honest about where metadata came
from. A package command should never leave project files and `feather.lock.json` describing
different worlds.

## Findings

### 1. Raw-source version overrides fetch the pinned catalog commit (`P0`)

For a version override, `apps/cli/src/lib/package/install.ts` computes:

```ts
src.baseUrl.replace(src.tag, pkg.versionOverride)
```

The registry validator requires raw `baseUrl` to contain `source.commitSha`, and the catalog entries
follow that rule. Their tag is therefore normally absent from the URL. The replacement is a no-op:
`anim8@v2.2.0`, for example, can fetch the catalog's SHA-pinned v2.3.1 bytes, compute new hashes, and
record the requested override label. Existing tests require `--allow-untrusted` but do not prove the
requested ref was fetched.

Git-transport overrides take a different path and are not affected by this exact bug.

### 2. Install and update are not transactional (`P0`)

Raw files are downloaded and written one at a time. A failure on a later file returns immediately.
Multi-package commands write the lockfile only when every result succeeds. This can leave new or
overwritten files on disk while the lockfile remains unchanged. Generated dependency aliases can
also fail after ordinary package files were written.

### 3. Ordinary file targets are not ownership-checked (`P0`)

The installer rejects duplicate targets inside one plan and checks generated dependency alias
collisions, but ordinary planned files are not checked against other lockfile owners or untracked
files on disk before `writeFileSync`. An install can overwrite user code or another package. An
update can also overwrite a locally modified managed file without first auditing it.

### 4. Remove deletes modified files (`P0`)

`apps/cli/src/commands/package/remove.ts` checks only whether each tracked path exists, then removes
it. It does not compare the current checksum with the lockfile. User edits are deleted after the
generic confirmation.

### 5. Lockfile reads are structurally trusted (`P0/P1`)

`readLockfile` parses JSON and casts it to `Lockfile`; only sources added through current code are
validated. `auditLockfile` joins `projectDir` and `file.target` directly instead of using the shared
safe target resolver. A malformed or adversarial lockfile can send audit reads outside the project.
Remove is safer because it uses `resolveProjectTarget`, but all consumers need one validated read.

### 6. Registry fallback hides provenance (`P1`)

Network, HTTP, schema, and cache failures all silently fall back to the bundled registry. That is a
good availability default, but callers cannot tell whether they are viewing network, cache, or
bundled data, how old it is, or why refresh failed.

### 7. Registry authenticity is not independent of the registry host (`P1`)

Per-file SHA-256 protects downloads against accidental changes, but the registry carries both URLs
and hashes. Compromise of the publishing branch/repository can replace metadata and expected hashes
together. The registry itself has no separately verified signature.

### 8. Cache and lockfile writes are non-atomic (`P1`)

Both are written directly to their final path. Interruption can leave corrupt JSON. Corrupt cache is
ignored; a corrupt project lockfile blocks package workflows until manually repaired.

### 9. Remove is not dependency-aware (`P1`)

Resolution detects install-time cycles and exact dependency conflicts, which is a good base.
Removal does not refuse when another installed package depends on the target and offers no explicit
cascade plan.

## Proposed transaction model

```text
resolve graph
  -> validate registry and lockfile
  -> plan all target ownership/conflicts
  -> fetch every source into staging
  -> resolve requested refs to immutable commits
  -> verify/compute every checksum
  -> present exact plan
  -> backup affected managed files
  -> atomic file swaps
  -> atomic lockfile replace last
  -> delete backup on success / rollback on failure
```

The transaction spans the full command, not each package independently. A dependency and its parent
must commit together.

## Source and version rules

- Resolve a requested GitHub tag/branch to an immutable commit before download.
- Fetch raw files using `repo + resolved commit + file path`; never rewrite a pinned URL string.
- Record requested ref, resolved commit, transport, file hashes, and resolution time separately.
- A version label is display metadata; the resolved commit is the reproducibility identity.
- Overrides remain explicitly untrusted unless their resolved metadata is covered by registry trust.

## Ownership rules

- Build a target-to-owner index from a fully validated lockfile.
- New package vs another owner: refuse.
- New package vs untracked existing file: refuse unless an explicit force/adopt workflow is chosen.
- Update own unchanged file: replace transactionally.
- Update own modified file: refuse by default; support backup/force with a precise warning.
- Remove unchanged managed file: delete in transaction.
- Remove modified managed file: preserve and remove ownership, or refuse; never silently delete.
- Remove required dependency: refuse with dependents, or require an explicit `--cascade` plan.

## Registry trust and status

Return `{ registry, source, fetchedAt, age, fallbackReason }`. Display fallback warnings in package
commands and Doctor. Sign generated registry metadata with a release key or an established signing
workflow; pin trusted public keys in the CLI and rotate them deliberately.

Use atomic temp-file plus rename for the cache and lockfile. Keep the previous valid lockfile as a
recoverable backup when a transaction changes files.

## Acceptance

- A multi-file failure at every write boundary leaves files and lockfile unchanged.
- A multi-package dependency failure commits nothing.
- Raw override integration test proves the resolved commit differs from the catalog pin and bytes
  match that commit.
- Cross-package, untracked-file, symlink, and modified-own-file collisions refuse before download or
  write.
- Remove preserves/refuses modified files and reports the exact recovery path.
- Malformed lockfiles cannot make audit read outside the project.
- Registry output always names network/cache/bundled provenance and staleness.
- Tampered signed registry metadata fails before package URLs are trusted.
- Interrupted cache/lockfile write leaves a readable previous version.
- Dependency-aware remove has tests for refuse and explicit cascade.

