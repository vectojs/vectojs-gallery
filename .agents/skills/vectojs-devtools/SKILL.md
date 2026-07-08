---
name: vectojs-devtools
description: Use when inspecting or debugging a live VectoJS scene with @vectojs/devtools — the VMT inspector panel, entity picking, tree/model queries, geometry readouts, or when you need to locate which entity owns a pixel or why an entity is positioned/sized wrong.
---

# VectoJS Devtools (@vectojs/devtools, 0.1.0+)

An in-page Virtual Math Tree inspector. The panel itself is a VectoJS Scene
(dogfooding `@vectojs/ui`), docked to the right edge of the page. Peer deps:
`@vectojs/core >=0.2.7`, `@vectojs/ui >=0.2.7`.

## Attach / detach

```ts
import { attachDevtools } from "@vectojs/devtools";

const devtools = attachDevtools(scene, {
  width: 320, // panel width px (default 320)
  refreshInterval: 500, // auto-refresh ms while open; 0 disables (default 500)
});
// …
devtools.detach(); // alias for panel.destroy(); always call on unmount
```

`attachDevtools` returns the `DevtoolsPanel`. One instance per inspected Scene.

## What the panel gives you

- **Entity tree** — live VMT view built from `scene.rootEntity` / `scene.overlayRootEntity`
  (public getters since core 0.2.8). Labels show `type (x,y) w×h` plus ⚡ (interactive)
  and ▶ (animating) markers.
- **Pick mode** — click any pixel on the host canvas; deepest entity wins
  (`isPointInside`, falling back to world-AABB via `worldToLocal`). Overlay root is
  checked before the main root.
- **Selection highlight** — drawn through the host scene's overlay, so it never
  pollutes the app's own tree.
- **Detail readout + nudging** — position/size/opacity/flags for the selected entity;
  arrow keys nudge `x/y` live for alignment tuning.

## Headless / programmatic use (preferred for agents)

You rarely need the visual panel: the model layer is exported and works in tests
and Node/jsdom. This is the state-space debugging path — query numbers instead of
taking screenshots:

```ts
import { buildTreeModel, describeEntity, pickInScene } from "@vectojs/devtools";

const { nodes, index } = buildTreeModel(scene.rootEntity); // serializable tree
const hit = pickInScene(scene, x, y); // which entity owns this point?
if (hit) console.log(describeEntity(hit)); // geometry/state lines
```

Use `pickInScene` to answer "what did the user actually click?" and
`describeEntity` to compare expected vs. actual geometry — the discrepancy usually
names the bug directly (see the `vectojs-paradigm` skill's debugging ladder).

## Gotchas

- The panel adds its own canvas + Scene; never video-export or benchmark with the
  panel attached.
- `refreshInterval` polls; for deterministic tests set it to `0` and call the model
  functions yourself.
- Devtools is a dev dependency by nature — gate `attachDevtools` behind a dev flag
  so it never ships to production bundles.
