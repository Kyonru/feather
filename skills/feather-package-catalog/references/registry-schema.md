# Registry Schema

## Package source files

Each catalog package is a JSON file in root `packages/`.

Common fields:

- `type`: normally `love2d-library`
- `trust`: `verified`, `known`, or `experimental`
- `description`
- `tags`
- `homepage`
- `license`
- `source`
- `install.files`
- optional `install.layout`: `fixed` keeps catalog targets exact for packages with hardcoded runtime paths; omitted means relocatable
- optional `dependencies`: exact package IDs from the same catalog, installed before the dependent package
- optional `dependencyAliases`: generated require shims for declared dependencies
- `require`
- `example`
- optional `subpackages`

Example source shape for a GitHub-backed package:

```json
{
  "source": {
    "repo": "owner/repo",
    "tag": "v1.0.0",
    "transport": "raw",
    "baseUrl": "https://raw.githubusercontent.com/owner/repo/<commit>/",
    "commitSha": "<commit>"
  }
}
```

Private or terminal-authenticated Git packages may use `"transport": "git"` and omit `baseUrl`.
Those packages are restored through the user's configured `git` credentials and still require
`commitSha` plus per-file SHA-256 values. Lockfiles must not contain credentials or signed URLs.

Each install file needs:

- `name`: file path under `baseUrl`
- `sha256`: expected file hash
- `target`: project-relative install path

`install.layout: "fixed"` is for curated packages whose upstream code expects specific project-root paths, such as `require("libs.json")`. Fixed-layout packages ignore `--install-dir` and cannot be flattened.

`dependencies` is exact and catalog-local in v1. It does not support version ranges, module providers, or project overrides.

`dependencyAliases` entries use `{ "dependency": "flux", "target": "lib/feel/vendor/flux.lua", "require": "lib.flux" }`.
The `dependency` must also be listed in `dependencies`; `require` is optional and defaults to the dependency's effective installed require path. Alias targets must be safe `.lua` paths and are stored as generated lockfile-managed files.

## Generated registry

`scripts/generate-registry.mjs` composes `cli/src/generated/registry.json`.

Generation behavior:

- Reads all `packages/*.json`.
- Sorts package files.
- Warns on missing `trust`, missing `source.baseUrl`, or placeholder checksums.
- Expands `subpackages` into top-level registry aliases with a `parent`.
- Adds `version` and `updatedAt`.

Do not edit `cli/src/generated/registry.json` directly.

## Subpackages

Use subpackages when a repo ships multiple modules that users may install independently. A subpackage references files from the parent package and has its own `require` and optional example.
