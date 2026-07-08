---
name: vectojs-core-runtime
description: Use when building or reviewing VectoJS apps with @vectojs/core, Scene/Entity, canvas rendering, semantic DOM projection, accessibility, automation, framework mounting, or lifecycle cleanup.
---

# VectoJS Core Runtime

Use this skill to build canvas-native VectoJS scenes that remain accessible, automatable, and cleanly disposable.

## Core workflow

1. Confirm installed package versions and inspect local source/docs when exact API behavior matters.
2. Start from `@vectojs/core` primitives: one `Scene` per canvas and `Entity` subclasses for custom drawing.
3. Use world/local coordinate conversion in hit tests. Do not subtract only `this.x` once nested transforms, scale, or rotation are possible.
4. Expose semantics for interactive entities with `getA11yAttributes()`.
5. Prefer `scene.renderMode = 'onDemand'` for static or event-driven UI; call `scene.markDirty()` after external mutations.
6. Always call `scene.destroy()` when the host framework unmounts.

For copyable examples, read `references/scene-recipes.md`.

## Architecture rules

- Treat VectoJS as a retained scene runtime, not a DOM component library.
- Let canvas own pixels and let the semantic layer own role/name/state and native input.
- Keep application state outside the scene when possible; update entities from state and mark the scene dirty.
- Use `Scene.step(dt)` for deterministic tests, simulations, and video export.
- Keep custom entities small: render, hit-test, semantics, and lifecycle should stay understandable without reading the whole app.

## Common mistakes

| Mistake                               | Correction                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Passing `renderMode` to `new Scene()` | Create the scene, then set `scene.renderMode = 'onDemand'`.                              |
| Pixel-coordinate tests for controls   | Use projected DOM roles for tests: `getByRole(...).click()`.                             |
| Forgetting teardown                   | Call `scene.destroy()` to release renderers, observers, workers, and projected DOM.      |
| Custom canvas input for text          | Use `@vectojs/ui` `Input`/`TextArea` so IME, selection, clipboard, and undo stay native. |
| Rebuilding text every frame           | Reuse entities and update width/content through the hot APIs where available.            |
| Discarding dynamic interactive children without cleanup | Call `scene.detachA11y(child)` first — `syncA11y` creates/updates shadow nodes but never prunes them. |

## Runtime gotchas (source-verified)

- **Animating from `update()`**: prefer overriding `hasPendingAnimations()`
  to report "still moving", or drive motion through
  `setTransition`/`animateTo`/`springTo`. On core **0.2.6+**, `markDirty()`
  called *inside* `update()` also works (the dirty flag is consumed before
  the update/render pass, so the mark survives to the next frame). On core
  **≤ 0.2.5** it was wiped by the loop's end-of-tick `dirty = false`, so an
  update()-integrating entity stepped at ~2 FPS once the throttle engaged —
  or stalled in onDemand mode. That exact bug shipped three separate times
  (ScrollView, VirtualList, TreeView).
- **onDemand + `autoThrottle: false`**: on core ≤ 0.2.5 this combination
  silently disables the onDemand frame skip (renders every rAF). Fixed in
  core 0.2.6; on older versions leave `autoThrottle` at its default.
- **Embedded (non-fullscreen) canvases**: pass `disableWindowResize: true`.
  On core ≤ 0.2.5 also call `scene.resize(w, h)` immediately after
  construction — the default renderer sized the canvas to the window anyway
  (fixed in core 0.2.6).
- **Custom `IRenderer` implementers**: `flush()` runs around *every*
  non-batched node each frame — it must only commit the pending primitive
  batch (near-zero cost when empty). Do end-of-frame work (a real GL render)
  in the optional `present()` hook, called exactly once per render pass.
- **Springs vs background tabs**: on core ≤ 0.2.5, `springTo` /
  `setTransition('spring')` integrated the raw rAF `dt`, so returning from a
  background tab (multi-second dt) made in-flight springs diverge violently.
  Core 0.2.6 substeps the integration.
- **`destroy()` and animation promises**: on core ≤ 0.2.5, promises from
  `animateTo`/`springTo` never settled if the entity was destroyed mid-flight
  (awaiting exit sequences hung). Core 0.2.6 resolves them on `destroy()`.

## Verification

Run the package or app’s normal checks. For the VectoJS monorepo, useful gates are:

```bash
bun run test
bun run build
oxlint packages/core/src packages/ui/src packages/three/src
prettier --check "**/*.{js,ts,json,md,html,yaml}"
```
