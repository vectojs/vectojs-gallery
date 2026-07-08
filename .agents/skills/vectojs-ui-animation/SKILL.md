---
name: vectojs-ui-animation
description: Use when creating polished VectoJS UI/UX with @vectojs/ui components, forms, overlays, hover/focus states, motion, transitions, microinteractions, or canvas-native interaction design.
---

# VectoJS UI Animation

Use this skill to turn VectoJS components into usable, accessible, and polished UI rather than just canvas drawings.

## Interaction workflow

1. Start with semantic components from `@vectojs/ui` before writing custom controls.
2. Model each interaction state: idle, hover, active, focus, loading, disabled, error, and success.
3. Use canvas motion for feedback, but preserve semantic state through the projected DOM.
4. Respect reduced motion. Suppress transform-heavy movement and keep essential opacity/state feedback.
5. Keep overlays in the Scene overlay root; dispose or hide transient UI when its target leaves the tree.
6. Test with keyboard and role-based automation, not only pointer clicks.

Read `references/ui-recipes.md` for patterns and snippets.

## Component guidance

- Use `Input` and `TextArea` for text entry so IME, selection, clipboard, and undo stay native.
- Use `Button`, `Toggle`, `Checkbox`, `Slider`, `Dropdown`, `RadioGroup`, and `Tabs` for controls with roles.
- Use `Tooltip`, `Popover`, `ContextMenu`, and `Modal` for transient UI; keep dismissal behavior explicit.
- Use `RichText.appendSpans()` and `Markdown.appendMarkdown()` for streaming output.
- Prefer `Stack`/`Flow` composition over hand-positioning every child.

## Motion rules

| Scenario          | Recommended motion                                                         |
| ----------------- | -------------------------------------------------------------------------- |
| Hover/focus       | Small color/outline/opacity changes, no layout jump                        |
| Press/click       | 80-160 ms scale or opacity feedback                                        |
| Overlay enter     | short fade/scale, block underlying clicks only after visible target exists |
| Streaming content | append and reflow incrementally; avoid resetting scroll unless intended    |
| Loading           | show immediate state, then progress if operation exceeds short delay       |
| Error/success     | pair color with text/icon/state; do not rely only on color                 |

## Common mistakes

- Drawing a beautiful control without `getA11yAttributes()` or a native UI component.
- Animating layout so aggressively that hit boxes and projected DOM feel detached.
- Rebuilding a whole component tree for every state change.
- Hiding focus indicators on canvas controls.
- Ignoring IME and clipboard behavior by faking text entry.
- Hand-rolling per-frame motion in `update()` without telling the Scene —
  invisible to the idle throttle, so the animation steps at 2 FPS or stalls
  in onDemand mode. Prefer `setTransition`/`animateTo`/`springTo` or override
  `hasPendingAnimations()`; on core 0.2.6+ `markDirty()` inside `update()`
  also works. See vectojs-core-runtime's "Runtime gotchas".
- Relying on in-flight springs across tab switches on core ≤ 0.2.5 — the
  unclamped rAF `dt` made them diverge; core 0.2.6 substeps. If stuck on an
  old core, re-seed positions on `visibilitychange`.
- Creating a new `Tooltip` per hover event instead of one per target (and on
  ui ≤ 0.2.5, rapid re-hovers stacked show timers — fixed in ui 0.2.6).
- Reimplementing slider keyboard handling — ui 0.2.6's `Slider` handles
  Arrow/Home/End itself and takes a `step` option (integer-only before).
