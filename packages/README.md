# Package Manager

Feather includes a curated package installer for LÖVE libraries. It is **not a general package manager** — it is a set of utilities to manage libraries that would otherwise require manual copy-paste. There is no central registry in the npm or Cargo sense. All catalog packages are sourced from GitHub repositories; if a repository is deleted, renamed, or made private, that package will no longer be installable. **You are responsible for your own copies.** Committing installed files to your repo rather than adding them to `.gitignore` is strongly recommended if long-term reproducibility matters to you.

The catalog is hand-curated and pinned to exact commit SHAs with verified checksums.

## Concepts

### Trust levels

| Level          | Meaning                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`     | Feather-reviewed. Pinned release + per-file SHA-256.                                                                                                                    |
| `known`        | Popular community library. Checksum-pinned but not audited in depth.                                                                                                    |
| `experimental` | Installed via `feather package add` or `--from-url`, or a version override (`name@version`). SHA-256 computed live. Requires `--allow-untrusted` for the CLI flag form. |

By default, `verified` and `known` packages install without extra flags. `experimental` requires `--allow-untrusted`.

Version overrides (`feather package install anim8@v2.2.0`) are treated as `experimental` even when the package itself is `verified` — the source (name, repo) is curated, but Feather has not reviewed that specific version.

### Lockfile

Every install, update, or remove updates `feather.lock.json` in your project root. Commit this file — it records the exact version and SHA-256 of every installed file so anyone cloning your project can restore dependencies with `feather package install` and verify them with `feather package audit`.

Custom GitHub repo installs also record the resolved commit SHA when available. Custom URL installs record the primary URL plus the selected URL list, and every custom file records its own URL and SHA-256. Older lockfiles remain compatible.

Newer lockfile capabilities may add top-level metadata such as `features` and `requiresFeather`.
Current Feather versions fail early with a clear update message when a project uses package-lock
features they cannot safely restore, such as generated dependency aliases from a newer CLI.
Old lockfiles without this metadata remain supported.

`feather doctor` includes lockfile verification and warns when package file URLs point outside trusted raw GitHub HTTPS sources:

```sh
feather doctor --security --json
```

---

## Commands

### `feather package search [query]`

Search the catalog by name, description, or tag.

```sh
feather package search animation
feather package search collision
feather package search oop
```

### `feather package list`

List all packages in the catalog. Add `--installed` to show only what's in your project.

```sh
feather package list
feather package list --installed
feather package list --refresh   # force re-fetch the registry
```

### `feather package info <name>`

Show full details for a package: description, trust, source, files, and usage snippet.

```sh
feather package info anim8
feather package info hump
```

### `feather package install`

Run with no arguments to restore all packages recorded in `feather.lock.json`. Files already on disk with the correct checksum are skipped; only missing or tampered files are re-downloaded.

```sh
feather package install
```

This is the command to run after cloning a project that has a lockfile.

If a missing or modified lockfile entry uses an experimental or untrusted source, non-interactive repair requires explicit consent:

```sh
feather package install --allow-untrusted
```

Without `--allow-untrusted`, Feather exits before downloading from that source. `--yes` does not bypass this trust check.

### `feather package install <name> [name2...]`

Install one or more packages. Files are verified against their SHA-256 before being written. The lockfile is updated on success.

```sh
feather package install anim8
feather package install bump lume flux
feather package install hump          # installs all hump modules
feather package install hump.camera   # installs only the camera module
feather package install feel --install-dir vendor --save-install-dir
```

Options:

| Flag                    | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `--dry-run`             | Show what would be installed without writing files                  |
| `--flat-dir <dir>`      | Flatten catalog package files into a directory                      |
| `--target-path <path>`  | Destination path for `--from-url` installs                          |
| `--install-dir <dir>`   | Install catalog package files under a custom base directory         |
| `--save-install-dir`    | Save `--install-dir` in `feather.lock.json` for future installs     |
| `--include-licenses`    | Install catalog-declared license files alongside package files      |
| `--offline`             | Use the bundled registry snapshot instead of fetching               |
| `--allow-untrusted`     | Required for `experimental` packages and version overrides          |
| `--allow-non-lua-files` | Allow installing packages that include non-Lua files (e.g. shaders) |

`--install-dir` preserves the package's catalog layout below the new base directory. For example,
`feather package install feel --install-dir vendor --save-install-dir` writes `vendor/feel/init.lua`
and `vendor/feel/vendor/flux.lua`, then records `installDir: "vendor"` so future
`feather package install feel` and `feather package update feel` runs keep using that location.
Some curated packages have fixed runtime paths because upstream code requires project-root modules
directly. For example, Menori requires `libs.json`, so Feather keeps `libs/json.lua` at the game
root even if `--install-dir` is provided. Fixed-layout packages cannot be installed with `--flat-dir`.
Catalog packages can also declare exact dependencies on other catalog packages. Dependencies install
first, are deduplicated, and use the Feather-pinned registry version.
Packages that expect a dependency at an upstream-specific require path can declare generated
dependency aliases. Feather writes a tiny Lua shim at the expected path that returns the shared
installed dependency, so libraries can share one dependency copy without vendoring or changing
`package.path`.
Private or otherwise non-public Git repositories can use Git transport. Feather shells out to the
`git` on your `PATH`, so SSH keys, credential helpers, and GitHub CLI credential managers work the
same way they do in your terminal. Lockfiles store only repo/ref/checksum metadata; they never store
credentials. Restoring these packages requires the same Git access in local shells or CI.
Packages with curated license metadata can install upstream license files beside the library when
you pass `--include-licenses`. To make this the project default, add:

```lua
-- feather.config.lua
return {
  packages = {
    installLicenses = true,
  },
}
```

Single-file modules get sidecar license files such as `lib/anim8.LICENSE`; folder-style packages
get license files inside the package directory such as `lib/feel/LICENSE`. License files are stored
in `feather.lock.json`, restored by `feather package install`, verified by `feather package audit`,
and removed with the owning package.
Use `--flat-dir` only when you deliberately want all catalog files flattened by basename, such as
`feel/init.lua` → `vendor/init.lua`.

**Example output:**

```
  anim8
  Source:  github.com/kikito/anim8
  Version: v2.3.1
  Trust:   [verified]
  Files:
    anim8.lua  →  lib/anim8.lua

✔ anim8 @ v2.3.1
  → lib/anim8.lua  checksum: verified

  Add to your code:
  local anim8 = require("lib.anim8")
```

### `feather package install <name>@<version>`

Install a specific version of a registry package that differs from the Feather-pinned release. Because that version has not been reviewed, the SHA-256 is computed live at install time rather than checked against the registry. **Requires `--allow-untrusted`.**

```sh
feather package install anim8@v2.2.0 --allow-untrusted
```

The package source (name, GitHub repo) is registry-curated, but the specific version is not. The install is stored in the lockfile with `trust: experimental` so it is clearly visible in `list --installed` and `audit` output.

**Example output:**

```
  anim8
  Source:  github.com/kikito/anim8
  Version: v2.2.0
  Trust:   [experimental]  (source is registry-curated, but v2.2.0 has not been reviewed)
  Files:
    anim8.lua  →  lib/anim8.lua

✔ anim8 @ v2.2.0
  → lib/anim8.lua  checksum: live-computed ⚠
```

If the requested version does not exist on GitHub, the install aborts with a clear error and a link to the package's releases page.

> [!NOTE]
> To go back to the Feather-reviewed version, run `feather package install anim8` (no version pin). This re-installs the registry-pinned release and resets the lockfile entry to `trust: verified`.

### `feather package add`

Install a Lua library that is not in the Feather catalog. Launches an interactive wizard and first asks how you want to add the package:

- **From GitHub repository** — commit-SHA pinned, reproducible. The wizard fetches the repo's tags and branches, lets you pick one, resolves it to an exact commit SHA, shows all `.lua` files in the tree, and lets you select which ones to install and where.
- **From Git repository using local git credentials** — same package shape, but repo access goes through your configured `git` credentials for private repositories.
- **From direct URL(s)** — for libraries not on GitHub or without versioned releases. Each URL is downloaded immediately and its SHA-256 is computed before you confirm.

Both flows share the same steps for naming the package, setting install paths, entering a require path, and reviewing before anything is written.

```sh
feather package add
feather package add --dir path/to/my-game
```

**GitHub repo flow (step by step):**

1. Choose mode → "From GitHub repository"
2. Package name — how it appears in `feather.lock.json`
3. GitHub repo (`owner/repo`)
4. Select a tag or branch — tags listed first, then branches
5. Select which `.lua` files to install
6. Set install target path for each file
7. Enter the require path for your game code
8. Review summary and confirm — files are written only after this step

**Direct URL flow (step by step):**

1. Choose mode → "From direct URL(s)"
2. Package name
3. Enter a file URL — downloaded and SHA-256 computed immediately
4. Confirm install path, optionally add more files to the same package
5. Enter the require path
6. Review summary and confirm

> [!CAUTION]
> Packages installed this way have `trust: experimental` — they have not been reviewed by the Feather team. Only install files from sources you trust. The SHA-256 of each file is recorded in the lockfile so future `feather package audit` runs will detect any tampering.
>
> Repo installs store the selected repo/tag and resolved commit SHA when available. Git-transport installs store no credentials or raw file URLs. URL installs store the primary URL, all selected URLs, per-file URLs, and per-file SHA-256 values.

### `feather package install --from-url <url> --target-path <path>`

Non-interactive equivalent of `feather package add`. Use this in scripts or CI where stdin is not a TTY. Installs a single Lua file from a URL.

**Requires `--allow-untrusted`** — the flag name makes the risk explicit.

```sh
feather package install --from-url https://example.com/mylib.lua \
  --target-path lib/mylib.lua \
  --allow-untrusted
```

`--yes` alone never confirms an untrusted URL. In scripts and CI, pass `--allow-untrusted` only after reviewing the source and target path.

### `feather package update [name]`

Update an installed package to the latest version in the registry. Omit the name to update all installed packages.

```sh
feather package update anim8
feather package update          # update all
feather package update --dry-run
```

`experimental` packages (installed via `feather package add` or `--from-url`) cannot be updated through the registry — use `feather package add` again to replace them.

### `feather package remove <name>`

Remove an installed package and its files. Updates the lockfile.

```sh
feather package remove anim8
feather package remove hump.camera
```

### `feather package audit`

Verify the SHA-256 of every installed file against the lockfile. Exits with code 1 if any file is modified or missing.

```sh
feather package audit
feather package audit --json    # machine-readable output
```

**Example output:**

```
Auditing 4 installed packages…

  ✔ anim8        lib/anim8.lua           verified
  ✔ hump.camera  lib/hump/camera.lua     verified
  ✖ baton        lib/baton.lua           MODIFIED  ← SHA-256 mismatch
  !  sti          lib/sti/init.lua        missing

1 issue(s) found. Re-install affected packages with `feather package install <name>`.
```

---

## Some Available Packages

| Package          | Trust    | Description                                     |
| ---------------- | -------- | ----------------------------------------------- |
| `anim8`          | verified | 2D sprite animation                             |
| `bump`           | verified | AABB collision detection                        |
| `classic`        | verified | Minimal OOP class library                       |
| `flux`           | verified | Tweening / easing                               |
| `hump`           | verified | Camera, timer, signal, class, vector, gamestate |
| `hump.camera`    | verified | Camera module only                              |
| `hump.class`     | verified | Class module only                               |
| `hump.gamestate` | verified | Gamestate module only                           |
| `hump.signal`    | verified | Signal module only                              |
| `hump.timer`     | verified | Timer module only                               |
| `hump.vector`    | verified | Vector module only                              |
| `inspect`        | verified | Human-readable table printer                    |
| `lume`           | verified | Functional utilities                            |
| `middleclass`    | verified | Full-featured OOP class library                 |
| `push`           | verified | Resolution-independence                         |
| `sti`            | known    | Simple Tiled Implementation (map loader)        |
| `windfield`      | known    | Box2D physics wrapper                           |

Run `feather package list` for the most up-to-date listing including any newly added packages.

---

## Security model

- **SHA-256 is verified before any file is written.** For registry installs, the checksum is checked against the Feather-pinned value before anything touches disk. A mismatch aborts the install.
- **Registry packages are pinned to an exact commit SHA.** Each package in the catalog records the specific Git commit the files were fetched from at the time of curation — not just a tag or branch name. This means downloads are reproducible: the same bytes are fetched on every install, even if a tag is later moved or a branch advances.
- **Version overrides and `feather package add` / `--from-url` compute SHA-256 live.** The hash is shown at install time and stored in the lockfile, so future `audit` runs detect tampering — but the initial download is not checked against a known-good value.
- **No post-install scripts.** No code runs during install, update, or remove.
- **Files stay inside your project.** Target paths are resolved and validated against the project root. Paths that would escape (e.g. `../../`) are rejected.
- **The registry is fetched over HTTPS only.**
- **`experimental` packages are flagged everywhere** — in install output, `list --installed`, and `audit` results. This includes version overrides and all URL installs.

---

## Contributing packages

To propose adding a package to the Feather catalog, open an issue at [github.com/Kyonru/feather](https://github.com/Kyonru/feather) with:

- The library name and GitHub repo
- The specific release tag or branch to pin
- Whether it meets the criteria for `verified` or `known` trust

Maintainers use interactive dev scripts to add, update, and remove catalog entries. All scripts open an ink TUI wizard and regenerate the registry automatically.

### Adding a GitHub-hosted package

```sh
npm run package:add       # add from GitHub repo (tag or branch)
npm run package:add-url   # add from direct file URL(s)
npm run package:update    # edit an existing package entry
npm run package:remove    # remove a package from the catalog
```

`package:add` fetches the repo's tags and branches from GitHub, lets you select one, resolves it to an exact commit SHA (for reproducible downloads), walks through trust level, description, tags, file selection, install targets, require path, and optional submodule definitions, then writes `packages/<id>.json` and regenerates the registry.

`package:add-url` follows the same wizard flow for libraries not hosted on GitHub or without versioned releases — you provide direct file URLs and the wizard computes checksums and handles everything else.

### Verifying checksums

```sh
node scripts/compute-checksums.mjs --all            # re-verify all package files against their stored SHA-256
node scripts/compute-checksums.mjs https://raw.githubusercontent.com/example/lib/main/lib.lua
node scripts/compute-checksums.mjs --package packages/anim8.json
```

### Package format

Each file in `packages/` is a standalone JSON manifest:

```json
{
  "type": "love2d-library",
  "trust": "verified",
  "description": "A 2D animation library for LÖVE",
  "tags": ["animation", "sprites"],
  "homepage": "https://github.com/kikito/anim8",
  "license": "MIT",
  "source": {
    "repo": "kikito/anim8",
    "tag": "v2.3.1",
    "commitSha": "c1c12ec...",
    "transport": "raw",
    "baseUrl": "https://raw.githubusercontent.com/kikito/anim8/c1c12ec.../"
  },
  "install": {
    "layout": "relocatable",
    "files": [{ "name": "anim8.lua", "sha256": "abc123...", "target": "lib/anim8.lua" }],
    "licenses": [{ "name": "LICENSE", "sha256": "def456..." }]
  },
  "dependencies": [],
  "dependencyAliases": [],
  "require": "lib.anim8",
  "example": "local anim8 = require('lib.anim8')"
}
```

The `commitSha` field pins downloads to the exact commit SHA of the selected tag or branch at curation time. Public packages usually omit `transport` or use `"raw"` with `baseUrl` so fetches are immutable even if the tag is later moved. Private packages can use `"transport": "git"` and omit `baseUrl`; Feather restores them through local Git credentials and still verifies each file checksum. In CI, configure an SSH deploy key or Git credential helper before running `feather package install`.

`install.layout` is optional. Omit it for normal relocatable packages. Use `"fixed"` only when a package has hardcoded runtime paths that must be installed exactly as declared. `install.licenses` is optional and must list explicit upstream license files with SHA-256 values; Feather does not auto-detect licenses. `dependencies` is also optional and currently supports exact catalog package IDs only. `dependencyAliases` can point one of those dependencies at an expected `.lua` target; aliases are generated lockfile-managed files. Version ranges, module providers, and project overrides are intentionally deferred.
