# Feather CLI

Focus:
Provide a lightweight command-line interface for project integration, diagnostics, plugin management, and automation workflows.

## Feather CLI (Experimental)

### Core CLI

- [ ] Add `feather` CLI executable
- [ ] Cross-platform support (Windows/macOS/Linux)
- [ ] Colored terminal output
- [ ] Structured error handling
- [ ] Shell-friendly exit codes

### Project Integration

- [ ] `feather init`
  - [ ] Detect Love2D project structure
  - [ ] Generate `feather.config.lua`
  - [ ] Install runtime bootstrap files
  - [ ] Configure websocket runtime
  - [ ] Optional hot-reload setup
  - [ ] Optional default plugin installation

### Diagnostics

- [ ] `feather doctor`
  - [ ] Check Love2D compatibility
  - [ ] Validate runtime installation
  - [ ] Detect websocket/port conflicts
  - [ ] Detect plugin compatibility issues
  - [ ] Validate debugger configuration

### Runtime Updating

- [ ] `feather update`
  - [ ] Update project runtime files
  - [ ] Update compatibility layer
  - [ ] Update default plugins

### Plugin Management

- [ ] `feather plugin install`
- [ ] `feather plugin list`
- [ ] `feather plugin update`
- [ ] `feather plugin remove`

### Plugin System Foundations

- [ ] Plugin manifest format
- [ ] Plugin version constraints
- [ ] Plugin compatibility validation
- [ ] Plugin dependency resolution

### Documentation

- [ ] CLI documentation
- [ ] Command examples
- [ ] Troubleshooting guide
- [ ] Plugin authoring guide

---

# Feather CLI — Initial Specification (v1)

## Goals

The Feather CLI should:

- simplify Feather integration
- reduce setup friction
- support plugin workflows
- provide diagnostics
- support future automation tooling

The CLI should NOT:

- replace the desktop app
- become a terminal IDE
- become a build system
- replace existing package managers

---

# Command Structure

## Initialization

### `feather init`

Initializes Feather inside a Love2D project.

### Responsibilities

- Detect project structure
- Create config file
- Install runtime integration
- Setup websocket connection
- Install default plugins (optional)

### Example

```bash
feather init
```

### Expected Output

```txt
✔ Detected Love2D project
✔ Generated feather.config.lua
✔ Installed Feather runtime
✔ Enabled remote debugging
```

---

# Runtime Commands

## `feather update`

Updates Feather runtime integration files.

### Responsibilities

- Update runtime files
- Update compatibility layer
- Update bundled plugins

### Non-Goals

- Self-updating desktop app
- OS package management

---

# Diagnostics

## `feather doctor`

Validates project/runtime setup.

### Checks

- Love2D compatibility
- Runtime version mismatch
- Port conflicts
- Firewall/network issues
- Plugin compatibility
- Missing runtime files

### Example

```txt
✔ Love 11.5 detected
✔ Runtime installed
⚠ Port 9001 already in use
✖ Shader Inspector requires Feather >= 0.10
```

---

# Plugin Commands

## `feather plugin install`

Install a plugin.

```bash
feather plugin install shader-inspector
```

---

## `feather plugin list`

List installed plugins.

```bash
feather plugin list
```

---

## `feather plugin update`

Update installed plugins.

```bash
feather plugin update
```

---

## `feather plugin remove`

Remove installed plugins.

```bash
feather plugin remove shader-inspector
```

---

# Plugin Manifest Proposal

## `feather-plugin.json`

```json
{
  "name": "shader-inspector",
  "version": "1.0.0",
  "description": "Runtime shader inspection tools",
  "author": "Kyonru",
  "entry": "index.lua",
  "compatibility": {
    "feather": ">=",
    "love": ">=11.0"
  }
}
```

---

# Architecture Direction

## CLI Responsibilities

- integration
- diagnostics
- automation
- plugin/package management

## Desktop Responsibilities

- visualization
- runtime inspection
- debugging UI
- timelines
- asset tooling

## Runtime Responsibilities

- websocket communication
- state inspection
- instrumentation hooks
- plugin execution

---

# Long-Term CLI Possibilities (Post-v1)

Potential future commands:

```bash
feather logs
feather capture
feather replay
feather profile
feather session export
```

These should remain out-of-scope for the initial CLI release.

---

# v1 Success Criteria

The CLI is successful if a developer can:

1. Install Feather
2. Integrate Feather into a Love2D project
3. Connect to the runtime
4. Install plugins
5. Diagnose issues

…within a few minutes and without manual setup steps.
