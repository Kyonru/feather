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
- `require`
- `example`
- optional `subpackages`

Example source shape for a GitHub-backed package:

```json
{
  "source": {
    "repo": "owner/repo",
    "tag": "v1.0.0",
    "baseUrl": "https://raw.githubusercontent.com/owner/repo/<commit>/",
    "commitSha": "<commit>"
  }
}
```

Each install file needs:

- `name`: file path under `baseUrl`
- `sha256`: expected file hash
- `target`: project-relative install path

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
