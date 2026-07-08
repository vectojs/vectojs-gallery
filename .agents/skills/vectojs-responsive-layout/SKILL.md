---
name: vectojs-responsive-layout
description: Use when designing adaptive VectoJS canvas layouts with browser resize or zoom, Stack, Flow, Card, ScrollView, VirtualList, responsive panels, dashboards, forms, or layout reflow.
---

# VectoJS Responsive Layout

Use this skill when a VectoJS UI must adapt to viewport size, browser zoom, density, content length, or resizable panels.

## Layout workflow

1. Define layout state in logical CSS pixels, not backing-store pixels.
2. Resize the `Scene` from the containing element, not blindly from `window`, when embedding in an app shell.
3. Compose with `Stack`, `Flow`, `Card`, `ScrollView`, `VirtualList`, `TreeView`, and resizable panels.
4. After direct child size changes, call the parent layout method and mark the scene dirty.
5. Keep one scroll owner per region; avoid nested wheel handlers without clear boundaries.
6. Use role labels and semantic regions even for canvas-rendered layout containers.

Read `references/layout-recipes.md` for copyable patterns.

## Design rules

- Use `scene.resize(width, height)` for logical layout dimensions.
- Let VectoJS/Canvas handle high-DPI backing stores; do not multiply layout coordinates by DPR.
- Make breakpoint decisions from available logical width/height.
- Prefer reflowing existing entities to destroying and recreating the full tree.
- Reserve virtualization for long lists/tables/trees; do not render thousands of offscreen rows as regular children.
- Treat browser zoom as a layout-input multiplier only when product requirements explicitly need density changes beyond normal CSS pixel behavior.

## Common mistakes

| Mistake                                          | Correction                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Reading `canvas.width` for layout                | Use container CSS size or `scene.width` / `scene.height`.           |
| Recreating every component on resize             | Reposition/reconfigure existing entities, then `scene.markDirty()`. |
| ScrollView inside another wheel-capturing region | Give each wheel gesture one owner or define escape behavior.        |
| Fixed desktop-only coordinates                   | Add breakpoint functions and test narrow, wide, and zoomed layouts. |
| Changing child size without relayout             | Call `stack.layout()` / equivalent and mark dirty.                  |
| Growing ScrollView content without re-measuring  | `scrollView.add()` measures automatically, but mutating an existing child's size needs `scrollView.updateContentSize()` or the max-scroll clamp goes stale. |
| Guessing `estimatedRowHeight` for fixed-height `VirtualList` rows | Set it to the exact row height — the estimate only exists for variable rows (measured heights are cached per index); `setItems()` resets scroll and that cache. |

## Verification

Check at least:

- narrow mobile width;
- desktop width;
- browser zoom 125% and 150%;
- keyboard navigation/focus order;
- role-based automation for interactive controls.
