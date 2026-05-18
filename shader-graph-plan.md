# Shader Graph — Visual Node-Based GLSL Editor for Feather + Love2D

## Context

Unity's ShaderGraph lets you build shaders visually by connecting nodes instead of writing GLSL by hand. This plan adds an equivalent feature to Feather: a dedicated `/shader-graph` page where you compose GLSL pixel + vertex shaders from a palette of nodes, see the generated code live, validate it against Love2D's compiler, and apply it directly to a particle-system-playground emitter. The particle-system-playground plugin already supports `set-shader`, so the Lua footprint for this feature is minimal.

---

## Architecture

```
Desktop (React)                           Game (Lua)
  │                                          │
  ├─ /shader-graph page                      ├─ shader-graph plugin
  │   NodePalette │ ReactFlow canvas │ Code  │   compile-shader action (validation only)
  │   playground target selector                     │
  │   codegen.ts (pure TS, browser-side)     ├─ particle-system-playground plugin (modified)
  │                                          │   update(dt) → shader:send("u_time", t)
  │   use-shader-graph.ts hook               │
  │   Zustand store (localStorage)           │
  └─                                        └─
```

---

## Phase Breakdown

| Phase                    | Goal                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 — Foundation           | Types, Zustand store, install `@xyflow/react`, codegen engine, Lua plugin skeleton, route + nav |
| 2 — Lua backend          | `compile-shader` action, `u_time` update in particle-system-playground                          |
| 3 — Node components      | ReactFlow custom nodes for all categories + palette                                             |
| 4 — Page assembly        | 3-panel layout, code preview, toolbar, playground target selector                               |
| 5 — Integration + polish | Validate round-trip, apply-to-Playground, error display, localStorage persistence               |

---

## New Files

### TypeScript/React

**`src/types/shader-graph.ts`**
`GlslType`, `PortDef`, `NodeType` (full enum), `ShaderNodeData`, `ShaderNodeInstance`, `ShaderEdge`, `ParticleSystemPlaygroundTarget` types. Also exports the static node definition registry (`Record<NodeType, NodeDef>`) with port shapes for each node.

**`src/store/shader-graph.ts`**
Zustand store persisted to `localStorage` key `'feather-shader-graph'`. Persisted fields: `nodes`, `edges`, `shaderName`, `hotParticlesTarget`. Transient: `validationStatus`, `validationErrors`, `lastGeneratedGlsl`.

```typescript
type Store = {
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  selectedNodeId: string | null;
  shaderName: string;
  hotParticlesTarget: { composite: string; systemIndex: number } | null;
  lastGeneratedGlsl: { pixel: string; vertex: string | null; hash: string } | null;
  validationStatus: 'idle' | 'validating' | 'ok' | 'error';
  validationErrors: { pixelError?: string; vertexError?: string };
  // Actions: setNodes, setEdges, addNode, removeNode, updateNodeData, selectNode, setPlaygroundTarget, setLastGlsl, setValidationStatus
};
```

**`src/pages/shader-graph/codegen.ts`**
Pure TS GLSL generation. Input: `nodes`, `edges`. Output: `{ pixel: string; vertex: string | null }`.

Algorithm:

1. DFS from `FragmentOutput` (and `VertexOutput` if present) to collect reachable nodes in post-order
2. Assign variable names: `v_<shortId>_<portId>`
3. Collect `extern` declarations (e.g. `extern float u_time;`) in a pre-pass; deduplicate
4. Emit per-node GLSL using an emitter registry, with type coercion for mismatched port types (float→vec4 expands to `vec4(x,x,x,1.0)`, vec4→float narrows to `.x`)
5. Wrap in `vec4 effect(vec4 color, Image VarTex0, vec2 texture_coords, vec2 screen_coords)` for pixel; `vec4 position(mat4 transform_projection, vec4 vertex_position)` for vertex
6. Prepend helper functions (e.g. `feather_hash`, `feather_noise`) if any noise nodes exist
7. Fallback: empty graph → passthrough `return Texel(VarTex0, texture_coords) * color;`

**`src/pages/shader-graph/index.tsx`**
Top-level page. Toolbar (shader name, Validate, Apply to Playground, Copy buttons) above a `ResizablePanelGroup` with 3 panels: `NodePalette` 20% | `ShaderCanvas` 55% | `NodeInspector` + `CodePreview` 25%.

**`src/pages/shader-graph/ShaderCanvas.tsx`**
Wraps `<ReactFlow nodeTypes={nodeTypes} ...>` in controlled mode: reads `nodes`/`edges` from Zustand, applies `applyNodeChanges`/`applyEdgeChanges` on callbacks, writes back to store. Handles `onDrop` for drag-from-palette: reads `event.dataTransfer.getData('application/shader-node-type')`, converts screen→flow coords with `reactFlowInstance.screenToFlowPosition()`, dispatches `addNode`.

**`src/pages/shader-graph/NodePalette.tsx`**
Left panel. Collapsible sections by category. Each node type is `draggable` (sets dataTransfer on `dragStart`). Section below: playground target selector (`<Select>` for composite + number input for emitter index), visible only when particle-system-playground data is available.

**`src/pages/shader-graph/NodeInspector.tsx`**
Right panel top. Editable props for selected node (float inputs, vec4 RGBA swatches). Empty state when nothing selected.

**`src/pages/shader-graph/CodePreview.tsx`**
Right panel bottom. Syntax-highlighted GLSL via `prism-react-renderer` with `glsl` language (already in deps). Inline error display with `AlertTriangleIcon`. Toolbar buttons: Validate, Apply to Playground, Copy Pixel, Copy Vertex.

**`src/pages/shader-graph/nodes/`**
Node components registered in `nodeTypes`. One file per category:

- `InputNodes.tsx` — TextureColor, TextureCoords, ScreenCoords, VertexColor, Time, Resolution, FloatConstant, Vec2Constant, Vec4Constant
- `MathNodes.tsx` — Add, Multiply, Subtract, Divide, Power, Clamp, Lerp, Step, Smoothstep, Sin, Cos, Abs, Fract, Floor
- `VectorNodes.tsx` — Split, Combine, Normalize, Length, Dot
- `ColorNodes.tsx` — Desaturate, OneMinus, HueShift
- `NoiseNodes.tsx` — SimpleNoise, Ripple
- `OutputNodes.tsx` — FragmentOutput
- `VertexNodes.tsx` — VertexPosition, TransformMatrix, VertexOutput

All nodes follow this pattern:

```tsx
export function AddNode({ data, selected }: NodeProps<ShaderNodeData>) {
  return (
    <div
      className={cn(
        'rounded border bg-card px-3 py-2 shadow-sm text-xs min-w-24 border-l-2 border-l-orange-500',
        selected && 'ring-2 ring-primary',
      )}
    >
      <Handle type="target" position={Position.Left} id="in0" style={{ top: '33%' }} />
      <Handle type="target" position={Position.Left} id="in1" style={{ top: '66%' }} />
      <div className="text-[10px] uppercase text-muted-foreground mb-1">Math</div>
      <div className="font-semibold">{data.label}</div>
      <Handle type="source" position={Position.Right} id="out0" />
    </div>
  );
}
```

Color coding: Input=blue, Math=orange, Vector=purple, Color=pink, Noise=green, Output=red.

**`src/hooks/use-shader-graph.ts`**
Composes Zustand store + `useParticleSystemPlayground()` + WS sending. Exposes:

- `generateAndStore()` — runs codegen, updates store
- `validateShader()` — sends `compile-shader` to shader-graph plugin; watches React Query key `pluginAction(sessionId, 'shader-graph', 'compile-shader')` for result
- `applyToParticleSystemPlayground()` — sends `cmd:plugin:action` to particle-system-playground `set-shader` with `shaderSource` from store
- `shaderApplyError` — from `playground.shaderError`

### Lua

**`src-lua/plugins/shader-graph/manifest.lua`**

```lua
return {
  id = "shader-graph", name = "Shader Graph",
  description = "Visual GLSL shader authoring with live validation",
  version = "1.0.0", capabilities = {}, optIn = false, disabled = false, api = 5,
}
```

**`src-lua/plugins/shader-graph/init.lua`**
Minimal plugin — only validates GLSL.

- `handleRequest()` → `{type="shader-graph"}`
- `handleActionRequest()`:
  - `compile-shader`: `pcall(love.graphics.newShader, pixelSource)` (and combined if vertex non-empty). Return `{status="ok"}` or `{status="error", pixelError=..., vertexError=...}`. Note: Love2D's combined shader format puts vertex and pixel in one string separated by `varying` declarations; for validation we can test each separately.
- `getConfig()` → `{type="shader-graph"}` (no `tabName` — not shown in plugins sidebar)

---

## Modified Files

**`src/router.tsx`**
Add `import ShaderGraph from './pages/shader-graph'` and route:

```tsx
<Route
  path="/shader-graph"
  element={
    <RequireSession>
      <ShaderGraph />
    </RequireSession>
  }
/>
```

**`src/components/app-sidebar/nav-main.tsx`**
Add `WorkflowIcon` import from `lucide-react`. Add to `items`:

```tsx
{ title: 'Shader Graph', url: '/shader-graph', icon: WorkflowIcon }
```

**`package.json`**
Add `"@xyflow/react": "^12.x"` to `dependencies`. Run `npm install`.

**`src-lua/plugins/particle-system-playground/init.lua`**
In `ParticleSystemPlaygroundPlugin:update(dt)`:

1. Add `self.time = (self.time or 0) + dt` at the top
2. In the scratch composites loop, after each `system.system:update(dt)`:
   ```lua
   if system.shader then
     pcall(system.shader.send, system.shader, "u_time", self.time)
   end
   ```
   `shader:send` on a non-existent extern is a silent no-op in Love2D — existing shaders are unaffected.

**`src-lua/manifest.txt`**
Add before `plugin:hot-reload` entries (alphabetical):

```
plugin:shader-graph:init.lua
plugin:shader-graph:manifest.lua
```

**`cli/src/generated/plugin-catalog.ts`**
Regenerate via `npm run generate:plugin-catalog` after manifest entries are added.

---

## "Apply to Particles Playground" WS Flow

1. Desktop generates GLSL via `codegen(nodes, edges)`
2. Sends to particle-system-playground plugin:
   ```json
   {
     "type": "cmd:plugin:action",
     "plugin": "particle-system-playground",
     "action": "set-shader",
     "params": { "composite": "<name>", "systemIndex": 1, "shaderSource": "...", "filename": "my-shader.glsl" }
   }
   ```
3. Response arrives in React Query at `pluginAction(sessionId, 'particle-system-playground', 'set-shader')`
4. `useParticleSystemPlayground().shaderError` surfaces any compile error
5. Hot-particles Lua plugin's `update(dt)` sends `u_time` every frame to the shader automatically

---

## Node Types Reference

| Category     | Nodes                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Input        | TextureColor, TextureCoords, ScreenCoords, VertexColor, Time, Resolution, FloatConstant, Vec2Constant, Vec4Constant |
| Math         | Add, Subtract, Multiply, Divide, Power, Clamp, Lerp, Step, Smoothstep, Sin, Cos, Abs, Fract, Floor                  |
| Vector       | Split, Combine, Normalize, Length, Dot                                                                              |
| Color        | Desaturate, OneMinus, HueShift                                                                                      |
| Noise        | SimpleNoise (hash-based), Ripple (sin-wave UV distortion)                                                           |
| Pixel Output | FragmentOutput                                                                                                      |
| Vertex       | VertexPosition, TransformMatrix, VertexOutput                                                                       |

---

## Codegen Type Coercion Rules

| Source type | Target type | Coercion                 |
| ----------- | ----------- | ------------------------ |
| `float`     | `vec2`      | `vec2(x, x)`             |
| `float`     | `vec4`      | `vec4(x, x, x, 1.0)`     |
| `vec4`      | `float`     | `x.r`                    |
| `vec2`      | `vec4`      | `vec4(x, 0.0, 0.0, 1.0)` |
| same        | same        | identity                 |

---

## Verification

1. **Dependency + TypeScript**: `npm install && npm run typecheck` — 0 errors
2. **Route + nav**: Navigate to `/shader-graph` — page renders; sidebar shows "Shader Graph"
3. **Drag-drop**: Drag "Float Constant" from palette → node appears on canvas at drop position
4. **Codegen — empty**: No nodes → code preview shows passthrough `return Texel(...)` shader
5. **Codegen — graph**: `Time` → `Sin` → `Combine` → `FragmentOutput` → correct GLSL with `u_time` and `sin()` visible
6. **Lua validation**: Click "Validate" → `compile-shader` WS roundtrip → status `ok` visible in UI. Add syntax error manually → `error` with message.
7. **Apply to Playground**: Select playground composite + emitter in palette target selector → click "Apply to Playground" → switch to Particles Playground tab → system shows shader source populated
8. **Time animation**: Shader with `sin(u_time)` applied to Playground emitter → particles visibly animate over time
9. **Persistence**: Reload app → graph nodes/edges restored from localStorage
10. **manifest.txt**: `npm run generate:plugin-catalog` succeeds; `shader-graph` appears in catalog
11. **No regression**: Particles Playground page works normally; existing particle-editor plugin unaffected
