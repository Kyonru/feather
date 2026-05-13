# Package Manager

Feather includes a curated package installer for LÖVE libraries. It is not a general package manager. It is a hand-curated catalog of known-good libraries with verified checksums.

## Concepts

### Trust levels

| Level          | Meaning                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `verified`     | Feather-reviewed. Pinned release + per-file SHA-256.                                                                    |
| `known`        | Popular community library. Checksum-pinned but not audited in depth.                                                    |
| `experimental` | Installed via `--from-url` or a version override (`name@version`). SHA-256 computed live. Requires `--allow-untrusted`. |

By default, `verified` and `known` packages install without extra flags. `experimental` requires `--allow-untrusted`.

Version overrides (`feather package install anim8@v2.2.0`) are treated as `experimental` even when the package itself is `verified` — the source (name, repo) is curated, but Feather has not reviewed that specific version.

### Lockfile

Every install, update, or remove updates `feather.lock.json` in your project root. Commit this file — it records the exact version and SHA-256 of every installed file so anyone cloning your project can restore dependencies with `feather package install` and verify them with `feather package audit`.

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

### `feather package install <name> [name2...]`

Install one or more packages. Files are verified against their SHA-256 before being written. The lockfile is updated on success.

```sh
feather package install anim8
feather package install bump lume flux
feather package install hump          # installs all hump modules
feather package install hump.camera   # installs only the camera module
```

Options:

| Flag                | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `--dry-run`         | Show what would be installed without writing files         |
| `--target <dir>`    | Override the install directory                             |
| `--offline`         | Use the bundled registry snapshot instead of fetching      |
| `--allow-untrusted` | Required for `experimental` packages and version overrides |

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

### `feather package install --from-url <url> --target <path>`

Install a single Lua file from an arbitrary URL. The SHA-256 is computed and shown before the file is written. The package is stored in the lockfile with `trust: experimental`.

**Requires `--allow-untrusted`** — this is intentional. The flag name makes the risk explicit.

```sh
feather package install --from-url https://example.com/mylib.lua \
  --target lib/mylib.lua \
  --allow-untrusted
```

> [!CAUTION]
> Experimental packages have not been reviewed by the Feather team. Only install files from sources you trust. The SHA-256 shown at install time is what will be verified by future `feather package audit` runs.

### `feather package update [name]`

Update an installed package to the latest version in the registry. Omit the name to update all installed packages.

```sh
feather package update anim8
feather package update          # update all
feather package update --dry-run
```

`experimental` packages (installed via `--from-url`) cannot be updated — re-install with `--from-url` to replace them.

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

## Available Packages

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
- **Version overrides and `--from-url` compute SHA-256 live.** The hash is shown at install time and stored in the lockfile, so future `audit` runs detect tampering — but the initial download is not checked against a known-good value.
- **No post-install scripts.** No code runs during install, update, or remove.
- **Files stay inside your project.** Target paths are resolved and validated against the project root. Paths that would escape (e.g. `../../`) are rejected.
- **The registry is fetched over HTTPS only.**
- **`experimental` packages are flagged everywhere** — in install output, `list --installed`, and `audit` results. This includes version overrides.

---

## Contributing packages

To propose adding a package to the Feather catalog, open an issue at [github.com/Kyonru/feather](https://github.com/Kyonru/feather) with:

- The library name and GitHub repo
- The specific release tag or commit to pin
- Whether it meets the criteria for `verified` or `known` trust

Maintainers will compute checksums, review the library, and add it to `packages/`.

To compute checksums locally while developing:

```sh
node scripts/compute-checksums.mjs --all            # verify all package files
node scripts/compute-checksums.mjs https://raw.githubusercontent.com/example/lib/main/lib.lua
node scripts/compute-checksums.mjs --package packages/anim8.json
```
