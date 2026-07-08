---
name: vectojs-three
description: Use when embedding VectoJS in Three.js or WebXR with @vectojs/three, ThreeAdapter, canvas textures, raycaster input, UV-to-scene event routing, hover/wheel behavior, or disposal.
---

# VectoJS Three

Use this skill to place a live VectoJS 2D interface onto a Three.js texture and route 3D pointer input back into the VectoJS scene.

## Integration workflow

1. Install `@vectojs/core`, `@vectojs/three`, `three`, and `@vectojs/ui` if using UI components.
2. Create one `ThreeAdapter` per VectoJS panel texture.
3. Add VectoJS entities to `adapter.vectoScene`, then start the inner scene.
4. Add `adapter.mesh` or the adapter texture/material to the host Three.js scene.
5. In the host pointer/wheel loop, raycast against the adapter mesh and call `adapter.updateIntersection(...)`.
6. Call `adapter.dispose()` when removing the panel.

Read `references/three-recipes.md` for snippets.

## Constraints

- The default output is a flat textured plane, not DOM rendered in 3D.
- VectoJS logical hit-testing remains 2D even when the mesh is transformed in world space.
- The host application owns the camera, renderer, controls, XR session, raycaster, and occlusion rules.
- Raycast UVs should map to the adapter’s logical `width`/`height`; do not use backing-store size for layout math.
- Texture resolution affects sharpness and upload cost. Choose dimensions for the viewing distance.

## Common mistakes

| Mistake                                       | Correction                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Adding an offscreen adapter canvas to the DOM | Add `adapter.mesh` to Three.js; the canvas backs the texture.                    |
| Forgetting to call `updateIntersection`       | Route host raycaster events into the adapter each pointer/wheel event.           |
| Dispatching by screen coordinates             | Use raycast UVs through `ThreeAdapter`.                                          |
| Keeping disposed textures alive               | Call `adapter.dispose()` and remove host references.                             |
| Expecting full DOM a11y inside XR             | Treat the 3D panel as canvas texture; provide host-level semantics where needed. |

## Version and backend gotchas (source-verified)

- **three ≤ 0.1.3**: `ThreeRenderer.flush()` performed a full GL render, and
  the Scene flushes around every non-batched node — frame cost grew O(N²) in
  entity count. three 0.1.4 renders once per frame via the `present()` hook;
  upgrade before profiling anything else.
- **Native input inside a texture is limited.** The adapter's canvas is
  offscreen, so the Scene's projected a11y elements are never connected to the
  document; `updateIntersection` falls back to VectoJS's own event dispatch.
  Buttons/hover/wheel work; full native IME/text editing does not — keep text
  entry outside the 3D panel or accept simplified input.
- **`stroke()` line width is effectively 1px** on most platforms
  (`LineBasicMaterial.linewidth` is a known WebGL limitation). Draw thick
  lines as filled shapes instead.
- `ThreeRenderer.drawImage` allocates a texture per call per frame (disposed
  on `clear()`); reuse a source canvas where possible. `fillText` is cached
  from three 0.1.4 (LRU keyed by font|color|text, 256 entries) — on ≤ 0.1.3 it
  had the same per-call cost, so prefer `MSDFTextEntity` there.
