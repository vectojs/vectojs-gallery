# Editorial Showcase Design

**Status:** Approved
**Owner:** `CTX-0018`
**Scope:** `vectojs-gallery` catalog shell and shared showcase chrome
**Date:** 2026-08-17

## 1. Product Direction

The Gallery is an editorial digital-yearbook for VectoJS creations, not a
generic component catalog. The page should make each creation feel selected,
authored, and worth opening before asking the visitor to interact with it.

The visual language is warm paper, dark brown ink, restrained coral brand
colour, and one owned accent gradient per creation. Real or deterministic
preview media carries the visual weight. Decorative marks support hierarchy but
must not compete with the work itself.

The catalog remains a single VectoJS canvas application. The canvas is the
page: layout, hit testing, interaction, focus treatment, and state are owned by
the retained Entity tree. No sibling HTML or CSS layout is introduced. The
semantic DOM projected by VectoJS remains the accessibility and automation
surface.

## 2. Visual Tokens

The token source is `src/ui/tokens.ts`. Later implementation tasks may extend
it, but must preserve these roles:

| Role            | Contract                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Canvas ground   | Warm white / cream, with a slightly raised card surface and a sunk surface for secondary controls. |
| Primary text    | Dark warm brown with sufficient contrast on every catalog surface.                                 |
| Muted text      | Brown-gray for descriptions and metadata; never used for actionable labels.                        |
| Brand accent    | Coral-to-peach gradient for logo treatment, selected navigation, rules, and restrained hover glow. |
| Creation accent | Two-stop gradient plus solid glow keyed by stable creation ID.                                     |
| Rules           | Low-contrast warm gray; structural lines must not become a grid of visual noise.                   |
| Focus           | A visible high-contrast outline or accent halo that does not change layout geometry.               |

Typography has three roles: display for mastheads and section titles, body for
descriptions and controls, and mono for compact labels, tags, and technical
metadata. Type scale and line height must be shared through tokens or component
constants rather than independently tuned in each card.

## 3. Responsive Shell

The shell has three modes based on logical scene width. Exact thresholds are an
implementation detail of `CTX-0023`, but the modes must satisfy these ranges:

| Mode      | Width intent                                                | Navigation                                             | Catalog density                                                                                 |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `compact` | Phone and narrow embeds, including 320 and 360 logical px   | Pinned compact top bar or drawer trigger; no full rail | One column; media and hit targets remain usable without horizontal overflow.                    |
| `medium`  | Tablet and narrow desktop, including 560 and 768 logical px | Collapsed rail / brand strip                           | One or more columns according to measured card minimums; no forced equal-height page-wide grid. |
| `wide`    | Desktop, including 1024, 1440, and 1920 logical px          | Expanded persistent rail                               | Multi-column editorial grid with readable maximum content width and stable gutters.             |

The rail is not part of the document scroll. It remains pinned while the catalog
document scrolls. Compact navigation may reveal or hide its menu, but it must
not create a second competing scroll owner.

Resize and rail transitions relayout the existing tree. The following objects
remain the same instances across a resize: Bed, ScrollView, catalog section
entities, Creation cards, app cards, and static backdrop. Their numeric bounds
are updated and dirty state is explicitly marked. A resize may coalesce several
browser resize notifications into one scene frame, but must not reset document
scroll position or remount the current creation.

Required geometry probes cover logical widths `320`, `360`, `560`, `768`, `1024`,
`1440`, and `1920`, at representative viewport heights. Each probe asserts:

- No entity or semantic hit surface extends outside the usable workspace.
- Rail and compact navigation remain reachable and visible.
- Cards preserve their minimum usable width and do not overlap.
- The scroll viewport and document content retain their identity.
- Scroll offset is preserved, clamped only when the new document is shorter.

## 4. Persistent Catalog Tree

The catalog has one persistent document tree with this conceptual order:

1. Masthead / introduction.
2. Creations section header.
3. Creation editorial card grid.
4. Contribution banner or section footer.
5. Built on VectoJS section header.
6. Forge app card grid.
7. Bottom document padding.

The tree is owned by `Bed`; layout methods may update positions and sizes but
must not rebuild the ScrollView on every resize. Filtering, if reintroduced,
may rebuild the content deliberately, but it must be an explicit data change,
not a side effect of viewport layout.

The document has one scroll owner. Catalog wheel, trackpad, keyboard, and
projected native selection behavior must all operate through that owner. The
rail, masthead controls, and cards remain outside the scrolling content where
their product role requires them to be pinned.

## 5. Scroll and Scheduling Contract

Catalog scrolling is event-driven. `CTX-0024` must use the current document
scroll physics rather than introducing a second custom integrator. The catalog
must not run a forced keep-live render pump while idle. Scroll, image load,
hover, focus, resize, and navigation state changes explicitly call
`scene.markDirty()`.

Continuous redraw is reserved for creations whose own visual state changes every
frame. Opening and closing a creation must restore the shell's scheduler
defaults, including render mode and frame cap. No implementation may assume a
60 Hz display or hardcode a 16.67 ms budget. Any measurement must include the
runtime-calibrated refresh rate.

The static dot-grid backdrop should be cached, batched, or otherwise kept out
of unnecessary per-frame work. A catalog frame with no pending animation,
input, image load, or scroll change should settle without a full redraw loop.

## 6. Shared Editorial Card Anatomy

`CTX-0025` owns the shared anatomy for Creation and Forge App cards:

1. Stable semantic hit surface covering the complete actionable card.
2. Clipped media frame with a declared aspect-ratio contract.
3. Title and compact metadata row.
4. Clamped summary with deterministic line limit.
5. Optional footer for tags, external-link affordance, or status.
6. Visible focus treatment independent of hover treatment.

Cards are sized per row. A row may align its top edges and use a measured row
height, but the whole grid must not be globally equalized by the tallest card.
The media frame owns inner clipping and hover motion; the card's outer bounds,
neighbor positions, and semantic hit surface do not move on hover. Keyboard
activation must work from the card's projected role, and Enter/Space behavior
must not depend on pointer coordinates.

Reduced-motion behavior removes scale/bounce and keeps only instant state
changes or short opacity/color changes that communicate status. Focus must be
visible without requiring hover. Edge-hover tests must prove that a pointer at
the card boundary does not oscillate between neighboring cards.

## 7. Creation Preview Contract

`CTX-0032` extends `Creation` metadata with a stable preview contract:

```ts
interface CreationPreview {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly focalPoint?: { readonly x: number; readonly y: number };
}
```

The `src` may reference a committed poster or a deterministic lightweight
preview. It must identify the same creation regardless of registry order. The
intrinsic dimensions are authoritative for framing and must not be replaced by
guessed card dimensions. `ThumbDoodle` is retained only as an explicit fallback
when a preview cannot be supplied; it is not the normal visual treatment.

Representative previews are required for Studio, Dimension, Fruit Catch, Nexus,
Compare Pretext, and Stream Reader. Tests cover metadata completeness, stable
identity after registry reorder, fallback behavior, and framing at compact and
wide sizes.

## 8. Forge App Media Contract

`CTX-0035` owns app screenshot normalization. Every app image declares or
derives intrinsic dimensions and an explicit fit policy. The renderer must not
stretch a source image into an unrelated frame ratio.

The supported policies are `cover` for editorial hero emphasis and `contain`
when the whole interface must remain visible. A focal point may bias a cover
crop. Rounded corners clip the loaded bitmap as well as the placeholder. Asset
dimension and crop metadata tests cover Bakudan, Brings, Motif, Numera, Unisol,
and Vem. The implementation may use a local clipped media frame until upstream
Image support is available; `CTX-0040` is exploratory and does not block this
contract.

## 9. Contribution Banner

`CTX-0034` removes the Submit card from the Creation grid and replaces it with
a compact full-width editorial contribution banner or section footer. It must
not create an incomplete trailing grid cell or change card column geometry.

The banner contains a short invitation and a real link/action with projected
semantics, visible focus, keyboard activation, and explicit dirty invalidation.
Its layout must remain readable at one, two, and three card columns.

## 10. Loading, Failure, and Retry

`CTX-0026` models catalog and creation loading as explicit states:

```text
catalog -> loading -> loaded
                    \-> failed -> retry -> loading
```

Back navigation remains usable during loading and failure. Loading uses an
editorial treatment that reserves the creation workspace without pretending the
creation is interactive. Failure presents a concise recoverable message and a
Retry action. Retry targets the same stable creation ID.

Every lazy import continuation is generation-bound. A superseded selection or
destroyed shell cannot mount an old entity, replace current stage/chrome, or
surface a stale error. Tests cover delayed resolution, rejected imports, retry,
superseded imports, and destroy-during-load.

## 11. Accessibility and Interaction

All actionable entities expose an appropriate projected role, accessible name,
and state. The required keyboard paths are:

- Navigate to and activate every Creation card.
- Navigate to and activate every external Forge App link.
- Toggle expanded/collapsed navigation.
- Use Back from every creation state, including loading and failure.
- Focus and activate Retry.
- Preserve focus visibility after resize and rail transitions.

Focus scope must not leak into an unmounted creation. Destroying a creation
removes its semantic nodes and any owned DOM input, timer, animation, rAF, GPU
canvas, or event listener. The shared shell remains usable after each mount /
unmount cycle.

## 12. Phased Acceptance Matrix

| Task       | Deliverable                     | Focused acceptance                                                                                                            |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CTX-0018` | This specification              | Design contracts, dependencies, and test matrix are explicit and reviewable.                                                  |
| `CTX-0023` | Persistent responsive shell     | Seven-width geometry tests; same tree instances; scroll preserved; compact/medium/wide navigation.                            |
| `CTX-0024` | Event-driven catalog scheduling | Deterministic scroll physics; no idle catalog pump; dirty invalidation tests; static backdrop does not repaint unnecessarily. |
| `CTX-0025` | Shared editorial cards          | Media frame, semantic hit surface, clamping, row sizing, focus, reduced motion, edge-hover tests.                             |
| `CTX-0026` | Loading/error/retry             | Delayed, rejected, retried, superseded, and destroyed import tests; Back stays usable.                                        |
| `CTX-0032` | Creation previews               | Six representative previews; stable metadata; fallback and framing tests.                                                     |
| `CTX-0034` | Contribution banner             | No trailing grid cell; responsive geometry; real link semantics and keyboard focus.                                           |
| `CTX-0035` | Forge app media                 | Intrinsic dimensions, fit/crop/focal-point contract, all six app assets, loaded-image clipping tests.                         |
| `CTX-0033` | Full visual integration         | Shared token application, hierarchy, typography, density, motion, focus, and state surfaces are coherent.                     |
| `CTX-0037` | Role/lifecycle regression suite | Full role-based navigation, focus, selection, resize, retry, mount/unmount, and resource cleanup coverage.                    |
| `CTX-0038` | Real-browser baseline           | Headed Chrome and Firefox measurements with calibrated refreshHz, commit, DPR, viewport, backend, and host recorded.          |
| `CTX-0039` | Final acceptance                | `check`, tests, build, e2e, Lighthouse, role/lifecycle suite, and benchmark report pass across representative widths.         |

## 13. Verification Rules

Every implementation task runs the narrowest relevant tests while developing and
the repository gates before completion:

```text
bun run check
bun test
bun run build
```

Browser tests drive projected roles rather than canvas coordinates. Numeric
layout assertions use entity bounds, world transforms, scroll offsets, and
semantic tree snapshots before screenshots are considered. Screenshots are
only visual confirmation and cannot substitute for state-space assertions.

Real-browser performance claims require both Chrome/V8 and Firefox/SpiderMonkey
through the headed benchmark harness. The harness calibrates refresh rate at
runtime; reports must include `refreshHz` and must not claim a generic FPS or a
hardcoded frame budget.
