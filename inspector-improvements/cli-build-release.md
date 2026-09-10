# CLI, build, and release architecture

## Goal

Keep the CLI the canonical workflow engine while making its command, build-target, and automation
contracts reusable by the extension and MCP without importing one giant command surface.

## Findings

### 1. Command registration is the schema (`P1`)

`apps/cli/src/index.ts` is about 1,110 lines. Commander option declarations, defaults, validation,
and handler wiring are not exposed as a stable machine-readable contract. The VS Code extension
therefore reconstructs commands manually.

### 2. The MCP implementation dominates the CLI command layer (`P1`)

`apps/cli/src/commands/mcp.ts` is about 1,857 lines and registers 58 tools plus six resources. MCP
is a server/application adapter, but tool domains, schemas, response composition, HTTP transport,
and filesystem source lookup all live in one command module. See `mcp.md`.

### 3. Build target composition is centralized but not adapter-shaped (`P2`)

`build.ts` imports each platform implementation and switches orchestration around them. Android,
iOS, desktop, web, vendor, validation, release, and upload have useful internal separation, but no
common target adapter contract expresses prerequisites, plan, execute, artifacts, and cleanup.
Adding a target expands central conditionals and Doctor/build/release surfaces together.

### 4. Some large modules mix policy and mechanics (`P2`)

`vendor.ts` (~696), `ios.ts` (~634), `create.ts` (~605), `watch.ts` (~458), config (~402), and
release (~392) are understandable individually but combine planning, filesystem changes, process
execution, output, and platform policy. Splitting without contracts would only move lines.

### 5. File/manifest writes are generally direct (`P1`)

Build manifests, generated release scaffolds, and several config/cache paths write directly to the
final path. Package transactions are the most urgent instance (see `packages.md`), but a shared
atomic-write primitive would improve interruption behavior across the CLI.

### 6. Upload archive inspection needs resource limits (`P1`)

The upload safety scanner recursively inflates nested ZIP-like artifacts and reads them into memory.
It limits nesting depth, but not cumulative compressed bytes, uncompressed bytes, entry count, or
compression ratio. A malformed/local zip bomb can exhaust memory during a safety check.

### 7. Release safety has two layers whose intent is hard to follow (`P2`)

Mobile release builds without an embedded runtime can bypass source config preflight, while the
resulting artifacts are scanned before upload/release. The artifact scan is the stronger final
proof, but skip flags such as `skipProductionConfigPreflight` make policy easy to misuse from a new
caller. Express the required safety proof by artifact/workflow state instead of booleans.

## Proposed contracts

### Command descriptor

Each command exports metadata plus a handler:

```ts
type CommandDescriptor<Input, Output> = {
  id: string;
  schemaVersion: number;
  input: Schema<Input>;
  run(ctx: CommandContext, input: Input): Promise<Output>;
};
```

Commander, JSON/JSONL automation, extension integration, and documentation can adapt the same
descriptor. Interactive Ink workflows remain adapters that produce validated input.

### Build target adapter

```ts
type BuildTargetAdapter = {
  target: SupportedBuildTarget;
  validate(ctx): Finding[];
  plan(ctx): BuildPlan;
  execute(ctx, plan): Promise<BuildArtifact[]>;
  inspect(artifacts): SafetyResult[];
};
```

Doctor consumes `validate`; dry-run consumes `plan`; build consumes `execute`; upload/release consume
`inspect`. Target-specific policy stays with the adapter.

### Job context

Use a shared context for cancellation, progress events, redacted logging, subprocess execution,
temporary staging, and atomic writes. This provides the machine API the extension needs without
forking CLI behavior.

### Safety proof

Represent safety as explicit evidence:

- source plan excludes debugger/runtime, or inclusion was explicitly authorized;
- artifact type was inspectable;
- artifact scan completed within resource limits;
- no Feather paths were found;
- unknown inspection blocks release unless the existing explicit override is used.

## Acceptance

- Commander and JSON automation use the same input schemas/defaults.
- Extension workflow contract tests cannot drift from CLI option names.
- A new build target registers one adapter rather than editing unrelated command branches.
- All long operations support cancellation and structured progress.
- ZIP inspection stops at entry, compressed-byte, expanded-byte, and ratio limits with an `unknown`
  safety result rather than exhausting memory.
- Final manifests/config writes use atomic replace where supported.
- Release tests state which safety evidence allowed or blocked an artifact.
- Refactors preserve existing command text/JSON and e2e behavior unless separately documented.

