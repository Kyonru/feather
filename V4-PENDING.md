# V4 — what is left

*State as of 2026-09-10, at the end of the particles and Studio-colour work. Every claim here was
checked against the repository rather than recalled; where something is "done", the evidence is
named so you can disagree with it.*

---

## 0. How to read this

Four documents drive V4 and each owns its own detail:

| Document | Scope | State |
|---|---|---|
| `V4.md` | The re-architecture and release trains | Code landed; **5 release steps need push access** |
| `V4-ENHANCED.md` | Inspector, feature by feature | **Closed** |
| `V4-STUDIO.md` | Making Studio a usable product | S1–S3, S5 (C0/C1/C3) done; **S3b, S4, C2, C5 open** |
| `V4-PARTICLES.md` | Particle runtime and export | P1–P5 done; **§5.3 authoring redesign open** |

This file is the index of what is *not* done. When an item lands, record it in its own document and
delete the row here.

---

## 1. Needs you, not code

**Release dry-runs — 5 open checkboxes in `V4.md`.** All blocked on release/push access, none on
code:

- `cli-v4.0.1` publishes the CLI and nothing else
- a throwaway `cli-v0.0.0-rc.1` tag proves only the npm job runs
- a `studio-v*` release builds Studio and triggers no Inspector, CLI, runtime or extension release
- the same, proven by dry-run or pre-release
- packaged-artifact inventories for both desktop apps

**`V4-PARTICLES-GPU.md` is in this branch's history.** It was committed by accident in `bb8de80` —
a `git add -A` swept up a file that was meant to stay out of the tree — and untracked again in
`db7bedb`. The file is on disk and `.gitignore` now prevents a repeat, but the content is in the
commits. Rewriting history to remove it is cheap before the branch is pushed and expensive after.

---

## 2. Studio — the biggest remaining gap

### S3b — the workbench shape for Texture Lab and Particles

**Open.** Verified: neither `TextureLabPanel.tsx` nor the particle playground's `index.tsx` uses
`ResizablePanelGroup`, so neither has the three-region layout Shader Graph has. This is the one a
user feels immediately — two of the three tools do not look like the third.

Largest remaining UX change in Studio, and the one worth doing with someone watching.

### S4 — durable workspaces

**Open, and smaller than it looks.** All three tools already have the machinery and none has an
owner:

| Tool | What exists |
|---|---|
| Texture Lab | `textureLabWorkspaceId`, `textureLabWorkspaces`, `activateTextureLabWorkspace` |
| Particles | `writeLocalParticleWorkspace` / `loadLocalParticleWorkspace` / `deleteLocalParticleWorkspace`, keyed by an id that is currently `undefined` |
| Shader Graph | `activateWorkspace` in `store/shader-graph.ts` |

The missing piece is **one application-level notion of "the thing I am working on"** — named,
listed, switchable, saved on change, supplying the id each tool's persistence already wants.

Deleting a workspace should be explicit and confirmed. It is the only place in Feather that
irreversibly destroys the user's own work, and the only confirmation this product should have.

*Acceptance:* build something in each of the three tools, `kill -9` Studio, reopen, and find all
three exactly as you left them.

### S5 — C2 and C5 remain

- **C2 — freshness.** Only applies in `attached` mode, and matters there: a preview reflecting a
  game that has since restarted is the same lie Inspector had. `use-freshness.ts` judges against the
  session's `connectedAt`, not the clock.
- **C5 — third-party data.** The shader graph loads user files and every tool accepts imported
  workspaces. Be strict wherever a value authored outside this repository reaches rendering.

---

## 3. Particles — the redesign, not the runtime

**P1–P5 are done and the runtime work is finished.** Seven of eight definition-of-done items are
met. What remains is the half the five phases deliberately did not touch.

### §5.3 — the authoring model

**Open.** The plan is written and agreed; none of it is built:

1. templates as the opening screen rather than a dropdown
2. the gizmos kept — they are the real advantage over a slider panel
3. the native LÖVE property named beside each control, so the export reads in the same vocabulary
4. the timeline as a layer you *add*, not a surface every composite carries

### One definition-of-done item that cannot be met here

**`variants` atlases still draw in N calls.** Not achievable on LÖVE 11: `ParticleSystem` exposes 68
methods and none provides per-particle data to a shader — no `attachAttribute`, no seed, verified by
enumerating the metatable. P4 attacked the cost instead (9x less garbage, skipped entirely when
nothing moved). The draw-call fix needs per-particle attributes, which means the mesh backend
described in `V4-PARTICLES-GPU.md`.

---

## 4. Known duplication, measured

The theme registry and the particle semantics were both "one thing maintained twice", and both have
now been consolidated. So the obvious question is what else is. Measured rather than assumed:

| Location | Result |
|---|---|
| `src/utils/arrays.ts` | **byte-identical** (28 lines) |
| `src/utils/cache.ts` | **byte-identical** (80 lines) |
| `src/utils/timers.ts` | **byte-identical** (64 lines) |
| `src/utils/assets.ts` | differ — Studio's dead `createGif` was removed |
| `src/utils/file.ts` | differ by 6 lines |
| `src/lib`, `src/hooks`, `src/store` | no identical files |
| `src/components` | no overlap at all — Inspector 17 files, Studio 1 |

So: **three small files, 172 lines**, are genuinely duplicated. Candidates for `packages/ui` or a
small shared utils package, and cheap to do — but nothing like the 4,602 lines the theme registry
was, and none of them has drifted.

*(An earlier draft of this section asserted that the two `components/` trees were probably copies.
They are not; the claim was written before it was checked, and checking took one command.)*

## 5. Practices worth keeping

Written down because each was learned by getting it wrong in this cycle.

**Verify a test by breaking the thing it tests.** Three tests in the Studio work passed against
unfixed code. Worse, the particles export-equivalence test was *vacuous* when first written — it
sampled six hand-picked easings and a deliberately drifted `inQuad` passed straight through. It now
iterates all 26 and asserts the count.

**Measure, do not reason, about allocation.** Two allocations were found by benchmarking that
reasoning had missed — and one of them was the benchmark's own options table, which would have
masked the thing being measured.

**A surface token is not a mark.** The C0 regression — painting a small dot with a region tint,
making it invisible — has now happened twice. `verify:enhanced` checks for that exact shape.

**`git add -A` hides things.** It swept a file into history that was meant to stay out, and it
committed a 162 MB corrupted document three times without anyone seeing a diff. Stage deliberately,
and check file sizes after any scripted edit.

**Slicing backwards yields the empty string, and `str.replace('', x)` inserts between every
character.** That is how `V4-STUDIO.md` became 2,522,189 lines. Splice on indices.
