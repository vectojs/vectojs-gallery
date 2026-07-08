---
name: vectojs-paradigm
description: Use FIRST when building, changing, or debugging any UI in a VectoJS project — before writing code, before taking screenshots, and especially when tempted to add HTML elements, write CSS, use querySelector, or "look at" a rendering problem visually.
---

# The VectoJS Paradigm

Abandon the HTML/CSS mental model before touching a VectoJS project. VectoJS is
not "a canvas inside a webpage" — the canvas **is** the page. There is one
`<canvas>`, one `Scene`, and a retained scene graph (the Virtual Math Tree) of
`Entity` objects whose numeric state fully determines every pixel. If you find
yourself reaching for a `<div>`, a stylesheet, or a screenshot, stop and
re-enter the paradigm.

## The translation table (habit → VectoJS)

| HTML/CSS habit                        | VectoJS way                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Add a `<div>`/`<span>` wrapper        | Add an `Entity` (or `Stack`/`Flow`/`Card` container) to the scene tree                          |
| Write CSS rules / classes             | Set entity properties: `x`, `y`, `width`, `scaleX`, `opacity`, colors on the component          |
| Flexbox / grid layout                 | `Stack` (vertical/horizontal + gap) and `Flow` (wrapping); positions are numbers you own        |
| Media queries                         | Breakpoint functions on `scene.width`/`scene.height` (logical px); reposition and `markDirty()` |
| CSS transition / keyframes            | `setTransition({ x: 'spring' })` then assign, or `animateTo`/`springTo` (promise-based)         |
| `z-index`                             | Tree order (later siblings draw on top) or `scene.showOverlay()`                                |
| `document.querySelector` / DOM events | Keep references to your entities; `entity.on('click' \| 'hover' \| 'wheel' \| 'keydown', …)`    |
| `:hover` styles                       | `entity.on('hover')` / `on('pointerleave')` mutate state, scene repaints                        |
| `overflow: scroll`                    | `ScrollView` / `VirtualList` / `TreeView` (one scroll owner per region)                         |
| `<input>`, IME, clipboard             | `@vectojs/ui` `Input`/`TextArea` — the ONE place a real DOM element is correct                  |
| Accessibility via ARIA markup         | `getA11yAttributes()` on the entity; the Scene projects the semantic node for you               |
| SEO/find-in-page via HTML text        | `getContentProjection()` (core 0.2.7+) mirrors canvas text into the DOM automatically           |

**Never** hand-author sibling DOM next to the canvas for layout, styling, or
events. The only DOM VectoJS wants is the DOM it projects itself.

## Debug in state space, not pixel space

This is the paradigm's biggest efficiency win: **every visual fact has a
numeric cause you can read in code.** A misplaced button is not "somewhere on
the screenshot" — it is an entity whose `x`/`y`/`width`/`getWorldTransform()`
you can print and assert. Work in this order:

1. **Read the tree.** `scene.getA11yTree()` returns the semantic snapshot
   (roles, labels, values, hierarchy). Wrong structure here = wrong structure
   on screen, found without rendering anything.
2. **Read the numbers.** `entity.getWorldTransform()`, `.width`, `.opacity`,
   `hasPendingAnimations()`. Layout bugs are arithmetic bugs — compare the
   number you got with the number you expected. `@vectojs/devtools` (0.1.0+)
   packages this rung: `pickInScene(scene, x, y)` names the entity that owns a
   point and `describeEntity(hit)` prints its geometry — see the
   `vectojs-devtools` skill.
3. **Reproduce deterministically.** `scene.step(16.67)` advances exactly one
   frame with no wall clock; a "flickers sometimes" bug becomes "wrong at
   frame N" — steppable in a unit test.
4. **Snapshot as vectors, not pixels.** `scene.toSVG()` serializes the frame
   as inspectable XML — diff two SVGs to see _which shape moved by how much_,
   instead of eyeballing two PNGs.
5. **Drive it by role.** Playwright/agents click `getByRole('button', …)` on
   the projected a11y layer — behavioral assertions without coordinates.
6. **Screenshot last.** A screenshot is for _confirming_ a fix or catching
   what you cannot model (font rasterization, GPU compositing, DPR artifacts —
   and test those at `deviceScaleFactor: 2`). It is never the first probe.

## Red flags — stop and re-enter the paradigm

- "I'll just add a div/absolutely-positioned element over the canvas."
- "Let me write some CSS for this." (The canvas has no CSS. Entity properties.)
- "Take a screenshot and look for the problem." (Read `getA11yTree()` and the
  entity's numbers first — the bug is a value, not a picture.)
- "querySelector / addEventListener on the document." (Entities own events.)
- "It needs `position: fixed`." (That's `showOverlay()`.)
- "I'll poll with setTimeout until it looks right." (Use `step(dt)` and assert.)

## Cross-references

Build/runtime contracts → **vectojs-core-runtime** · layout →
**vectojs-responsive-layout** · motion → **vectojs-ui-animation** · speed →
**vectojs-performance** · 3D/XR → **vectojs-three** · MP4 export →
**vectojs-video-exporter**.
