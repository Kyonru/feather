# Lua plugins should describe UI declaratively

…and Feather renders it using React.

That distinction matters a lot architecturally.

---

# The wrong architecture

```txt id="tp1eiu"
Lua → directly manipulates React
```

Problems:

- tight coupling
- unstable APIs
- serialization nightmares
- plugin crashes affecting UI
- impossible versioning
- hard-to-secure execution

You do _not_ want Lua plugins reaching into React internals.

---

# The right architecture

Think of it more like:

- React DevTools
- VSCode extension webviews
- Ink
- Figma plugins
- Roblox widgets
- browser extension APIs

Where:

```txt id="f5q6jm"
Lua Plugin
   ↓
UI Description / Events
   ↓
Feather Protocol
   ↓
React Renderer
   ↓
Desktop UI
```

That’s much cleaner.

---

# The best mental model

Lua plugins define:

- components
- layout
- actions
- state bindings

Feather renders them.

Example:

```lua id="8dvvpy"
return feather.ui.panel({
  title = "Player Stats",

  feather.ui.text({
    value = player.health
  }),

  feather.ui.button({
    label = "Kill Player",
    onClick = function()
      player.health = 0
    end
  })
})
```

Internally this becomes:

```json id="p4r1zn"
{
  "type": "panel",
  "title": "Player Stats",
  "children": [...]
}
```

Then React renders it.

---

# This is actually a very strong direction

Because now:

## plugins become portable

You can theoretically render the same UI in:

- desktop app
- web app
- terminal UI
- remote inspector
- browser panel

if the protocol is declarative enough.

That’s powerful.

---

# Think “Remote React”

Not:

> “Lua controlling React”

But:

> “Lua describing UI trees”

This is basically:

- React reconciler concepts
- virtual DOM ideas
- declarative UI transport

---

# You probably want:

# a Feather UI Schema

Something like:

```txt id="t74d9h"
feather-ui-schema
```

Supported nodes:

- panel
- row
- column
- tabs
- text
- button
- checkbox
- input
- tree
- table
- graph
- timeline
- image
- inspector
- code editor

Plugins emit:

- UI tree
- state updates
- actions

Feather handles:

- rendering
- layout
- reconciliation
- events

---

# This becomes EXTREMELY powerful with time-travel debugging

Imagine plugins being able to render:

- timelines
- frame diffs
- replay graphs
- entity inspectors
- live charts

without needing native React knowledge.

That’s huge.

---

# You could even support:

## reactive state synchronization

Example:

```lua id="i5qu7z"
local counter = feather.state(0)

return feather.ui.button({
  label = function()
    return "Count: " .. counter:get()
  end,

  onClick = function()
    counter:set(counter:get() + 1)
  end
})
```

React side receives:

- state diffs
- subscriptions
- UI patches

Very similar to:

- React Fiber ideas
- remote component trees
- React Server Components philosophy

---

# My recommendation:

## DO NOT expose raw React

Expose:

# Feather UI primitives

Meaning:

- stable API
- engine-independent
- serializable
- versionable
- transport-safe

React becomes an implementation detail.

That’s critical.

Because later:

- React version changes
- renderer changes
- web support
- native support

won’t break plugins.

---

# Best Architecture

## Plugin Runtime (Lua)

Responsible for:

- logic
- runtime inspection
- generating UI trees
- responding to events

---

## Feather Protocol

Responsible for:

- serialization
- patch updates
- event transport
- state sync

---

## React Renderer

Responsible for:

- rendering
- animations
- layout
- interaction
- virtualization

---

# This could become one of Feather’s defining features

Because now plugins can create:

- inspectors
- charts
- graphs
- timelines
- editors
- profilers
- visualization tools

without:

- Electron knowledge
- React knowledge
- frontend tooling

That dramatically lowers plugin complexity.

---

# One VERY important recommendation

## Make the UI tree patchable

Do NOT resend full trees constantly.

You’ll eventually want:

- diff patches
- node IDs
- incremental reconciliation

Especially because:

- game data changes frequently
- timelines update constantly
- observers update every frame

Otherwise performance will collapse later.

---

# What Feather starts resembling with this architecture

A mix of:

- React DevTools
- Chrome DevTools Protocol
- VSCode extension APIs
- Ink
- Roblox Studio widgets
- Unity inspectors

That’s a very compelling direction.

Especially for game tooling.
