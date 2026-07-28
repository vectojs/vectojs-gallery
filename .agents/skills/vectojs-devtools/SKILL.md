---
name: vectojs-devtools
description: Use when inspecting or debugging a live VectoJS scene with @vectojs/devtools — the VMT inspector panel, entity picking, tree/model queries, geometry readouts, layout audits (text overflow, overlap), scene snapshots/diffs, or when you need to locate which entity owns a pixel or why an entity is positioned/sized wrong.
---

# VectoJS Devtools (@vectojs/devtools, 0.9.0+)

An in-page Virtual Math Tree inspector plus a headless audit/capture layer.
The panel itself is a VectoJS Scene (dogfooding `@vectojs/ui`), docked to the
right edge of the page. Peer deps: `@vectojs/core >=1.0.0 <2.0.0`, and `@vectojs/ui >=1.0.0 <3.0.0` (optional).

## Attach / detach

```ts
import { attachDevtools } from "@vectojs/devtools";

const devtools = attachDevtools(scene, {
  width: 360, // panel width px (default 360)
  refreshInterval: 500, // auto-refresh ms while open; 0 disables (default 500)
  traceEvents: true, // opt-in pointer/wheel/keyboard routing trace
  dockSide: "right", // 'right' | 'left' (0.5.0; default 'right')
  showPerf: true, // live perf HUD strip reading Scene.frameStats (0.5.0)
  defaultTab: "tree", // 'tree' | 'inspect' | 'audit' | 'events' | 'settings' (0.5.0)
});
// …
devtools.detach(); // alias for panel.destroy(); always call on unmount
```

`attachDevtools` returns the `DevtoolsPanel`. One instance per inspected Scene.

## What the panel gives you

Since **0.5.0** the panel is a modern glass dock (rounded corners, shadow,
`Card`-grouped sections) organized into **tabs** (`Tree · Info · Audit · Log ·
⚙`), with a header of three ghost text-glyph icon buttons (`⌖` pick / `⟳`
refresh / `⚠` audit) and count badges (total / interactive⚡ / findings⚠).

- **Entity tree (`Tree` tab)** — live VMT view built from `scene.rootEntity` /
  `scene.overlayRootEntity`. Labels show `type (x,y) w×h` plus ⚡ (interactive)
  and ▶ (animating) markers. A **filter Input** (0.5.0) narrows by type/id
  substring; it's view-only — the id→entity index still resolves everything.
  Programmatic: `panel.setFilter(text)`.
- **Pick mode** — click any pixel on the host canvas; deepest entity wins.
- **Audit (`Audit` tab, 0.2.0)** — runs `auditScene` and lists findings; selecting
  one selects + highlights the offending entity. Since 0.5.0 findings live in
  their own tab (they no longer replace the tree). Programmatic: `panel.audit()`
  returns the findings, `panel.selectFinding(i)` selects one.
- **Selection highlight** — drawn through the host scene's overlay. Toggle it via
  the Settings tab or `panel.setHighlightEnabled(bool)` (0.5.0).
- **Detail readout + inline edit (`Info` tab)** — position/size/opacity/flags;
  arrow keys nudge `x/y` live, and 0.5.0 adds inline `x`/`y`/`opacity` `Input`
  editors plus **Copy path** / **Copy state JSON** buttons. (Careful: while a
  devtools selection exists, arrows are consumed — in apps with their own
  keyboard nav, deselect or detach first.)
- **Perf HUD (0.5.0)** — a bottom strip reading `scene.frameStats` (fps,
  ms/frame, entity count, render mode, rendered/skipped frames). The fps is the
  real _rendered-frame_ cadence, so an idle `onDemand`/auto-throttled scene
  honestly reads ~2fps, not a fake 60. Disable with `showPerf: false`.
- **Settings tab (0.5.0)** — highlight toggle, refresh-interval and dock-side
  (left/right) switches (`panel.setRefreshInterval(ms)`, `panel.setDockSide(side)`).
- **Event trace (`Log` tab; 0.3.0; content provenance in 0.4.0; pointer cancellation in 0.4.1)** — opt-in bounded recent-event view. It shows pointer,
  wheel, and keyboard type/source/target summaries after application handlers
  run, including whether the browser default was prevented.

## Headless / programmatic use (preferred for agents)

You rarely need the visual panel: the model layer works in tests and jsdom.
Query numbers instead of taking screenshots.

```ts
import {
  buildTreeModel,
  pickInScene, // 0.1.x
  inspectEntity,
  entityPath, // 0.2.0
  auditScene,
  captureSnapshot,
  diffSnapshots, // 0.2.0
  createEventTrace, // 0.3.0
  auditSceneSelection,
  auditEntitySelection, // 0.6.0
  inspectA11y,
  auditA11y,
  a11yReadingOrder, // 0.8.0
  explainHitTest,
  formatHitExplanation, // 0.8.0
  highlightGeometry,
  sampleHitRegion, // 0.9.0
  inspectText,
  shapeProbe,
  auditTextShaping, // 0.9.0
  inspectMarkdownStream,
  auditMarkdownStreaming, // 0.9.0
  inspectGpu,
  auditGpu, // 0.9.0
  registerDevtoolsPlugin, // 0.9.0
  createDevtoolsBackend,
  createDevtoolsClient, // 0.9.0
} from "@vectojs/devtools/headless";

const hit = pickInScene(scene, x, y); // which entity owns this point?
if (hit) console.log(inspectEntity(hit)); // structured EntityInfo (JSON-safe)

const trace = createEventTrace(scene, { capacity: 50 });
trace.subscribe((entry) => console.log(entry.type, entry.targetPath));
// trace.entries is JSON-safe and oldest-to-newest; trace.destroy() removes listeners.
```

`inspectEntity` is the structured replacement for `describeEntity` (which still
exists, returning human-readable lines): world bounds + transform, flags,
`clipChildren`, child count, a duck-typed text preview (`.text` / `.value`),
and a11y projection attributes when present.

`createEventTrace` observes the document at capture phase but never installs VMT
listeners or changes dispatch. A projected a11y or selectable-content id resolves
first; canvas pointer input falls back to `pickInScene`; global keyboard routers
are reported as `source: "document"` when no entity owns the focused element.
Entries retain only scalar state, not DOM events or entity references.
`defaultPrevented` is read after browser dispatch completes, so it reports the
final application decision. Keep the trace opt-in and destroy it outside the
normal devtools panel life cycle.

The pointer trace includes `pointercancel`. For a transactional drag or range
selection, expect `pointerdown` followed by zero or more `pointermove` entries
and exactly one terminal `pointerup` (commit) or `pointercancel` (rollback).
Missing termination usually means the interactive entity was not projected or
the application bypassed VMT pointer capture.

`entry.source === "content"` means the native browser event started on a
`[data-vecto-content]` mirror. Use it with `defaultPrevented`, `targetPath`, and
local coordinates to diagnose why text drag-selection, copy, or wheel routing
was intercepted. Tests should dispatch from a descendant of the materialized
content node (`scene.getContentElement(id)`) and await one microtask before
asserting the finalized trace entry.

## Triage map: symptom → tool

Reach for numbers before screenshots:

| Symptom                                  | Workflow                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Which entity owns this pixel?            | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                                         |
| Entity positioned/sized wrong            | `inspectEntity` world bounds, then walk ancestors — first one with wrong bounds owns the bug (`entityPath` names the chain)               |
| Something overflows/overlaps somewhere   | `auditScene(scene)` — findings carry entityPath + per-edge overflow amounts                                                               |
| Interaction moved something it shouldn't | `captureSnapshot` → interact → `diffSnapshots` (paired by stable key, so a reordered list still attributes each change to the right node) |
| A click does nothing                     | `explainHitTest(scene, x, y)` → per-candidate verdict incl. why the expected entity lost                                                  |
| Hit area disagrees with what's painted   | `highlightGeometry` layer divergence; `sampleHitRegion` when the shape is not a box                                                       |
| Text renders wrong / RTL misordered      | `inspectText(entity)`, or `shapeProbe(str)` to test a string not in the scene                                                             |
| Streaming Markdown gets slower over time | `inspectMarkdownStream(entity)` → `tailFraction`; token reuse can look healthy while characters are re-read                               |
| Frame cost with no obvious cause         | `inspectGpu(scene)` after `setDrawCounters(true)`; check `unavailable` before reading a zero                                              |
| Click/wheel/key goes to the wrong place  | `createEventTrace` — source/targetPath/coords + final `defaultPrevented`                                                                  |
| Drag-selection or copy intercepted       | Trace entries with `source === "content"`; check `defaultPrevented` + targetPath                                                          |
| Drag stuck / never commits               | Pointer trace transaction: `pointerdown` → moves → exactly one `pointerup`/`pointercancel`; missing terminal = projection/capture bug     |
| Selection drifts from pixels after zoom  | Not a devtools bug — the app owns sizing and never called `scene.resize()` (Firefox Range recalibration)                                  |

`entityPath(entity)` returns the ancestry chain as `"Scene > Card#<id8> > Text#<id8>"`
(ids truncated to 8 chars) — note snapshot-diff paths use `type[index]` chains
instead, since ids are random per run.

## Scene auditing (0.2.0)

```ts
const findings = auditScene(scene, {
  tolerance: 0.5, // px slack before an escape/overlap counts
  includeOverlay: false, // overlay (modals/highlights) excluded by default
  ignore: (e) => e.id.startsWith("debug-"), // prune subtrees
  ignoreOverlap: (a, b) => a.id === "badge", // allow intentional stacking
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

Detects four kinds, deterministically sorted and JSON-safe:

- `text-overflow` — a text-bearing entity's measured box escapes its nearest
  sized ancestor. (ui `Text` self-sizes: its width/height ARE the measured
  content, so escaping the container means "the text doesn't fit".)
- `clip-overflow` — content escapes a `clipChildren` ancestor = pixels cut off.
- `overlap` — **siblings only** (parent-child containment is normal; cross-branch
  stacking belongs on the overlay, which is excluded by default).
- `viewport-overflow` — entity with no sized ancestor drawn outside the canvas.

Deliberate blind spots to know about: scrollable containers exempt the
**vertical** axis, and `opacity: 0` entities are skipped entirely. The default
scrollable set is `['ScrollView', 'VirtualList', 'TreeView', 'Tree']`, matched by
`constructor.name` — so minified bundles need explicit names. Two caveats worth
knowing: `'Tree'` matches no exported class (the component is `TreeView`), and
`Table` is now vertically scrollable when virtualized but is **not** in the
default set — pass `scrollableTypes: ['ScrollView', 'VirtualList', 'TreeView',
'Table']` if a virtualized Table produces false `clip-overflow` findings.

**CI gate pattern**: `expect(auditScene(scene)).toEqual([])` — "audit clean".

## Selection auditing (0.6.0)

`auditSceneSelection(scene)` / `auditEntitySelection(entity)` are the numeric
answer to "the DOM selection highlight doesn't line up with the canvas glyphs."
Use these instead of eyeballing a screenshot — they compare the projected
selection geometry against the painted glyph boxes and report the drift.

Reach for them when text is justified, RTL, rotated/mirrored, under non-uniform
scale or browser zoom, or inside a grid projection — the cases where a
projection-vs-canvas mismatch actually happens.

**Audit performance**: the sibling-overlap check is broad-phased through a
`SpatialHashGrid` rather than all-pairs, so auditing a long list or wide table is
no longer quadratic (4000 rows: 1280ms → 7.4ms). It is still a dev-only path —
don't ship it in a production frame loop.

## Snapshots & diffs (0.2.0)

```ts
const before = captureSnapshot(scene); // deterministic JSON tree of the whole scene
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

Diffs are keyed by **structural path** (`type[index]` chains), never by entity
id — ids are random per run. Default-valued props (opacity 1, flags false) are
omitted from snapshots so JSON diffs stay quiet. Use snapshot-pairs as golden-
state assertions in smoke tests.

## Why is this NOT being hit? (0.8.0)

`explainHitTest(scene, x, y)` mirrors `Scene.findHitRecursively`'s own rejection
conditions and returns a verdict per candidate: `accepted`, `invisible`,
`clipped`, `pointer-transparent`, `outside-shape`, `occluded`. It deliberately
does not short-circuit, so occluded candidates are still enumerated — the entity
you expected to be hit appears in the list with the reason it lost.

```ts
console.log(formatHitExplanation(explainHitTest(scene, 120, 240)));
```

## Highlight geometry layers (0.9.0)

`highlightGeometry(scene, entity)` returns each box the entity carries as a **true
polygon** in scene coordinates, flagged when it drifts from the layout box:
`layout` (real edges under rotation, which an AABB loses), `render`
(`getBounds()`), `clip` (nearest clipping ancestor), `content` (projected content
element), `a11y` (accessibility element). Divergence between them is the bug class
this exists to reveal — a control whose hit area drifted from its paint, text
painted outside the box that clips it.

`panel.setHighlightLayers(['layout', 'clip'])` chooses what the panel draws;
default stays `['aabb']`.

`sampleHitRegion(entity)` covers the one layer with no retrievable geometry:
`isPointInside` is a predicate, so the region is approximated by probing a grid.
Off by default (cost is quadratic in entity size) and compared by **area
coverage**, not extent — a circle inscribed in its box has the box's exact extent
while accepting ~79% of its points, so an extent check reports the most common
divergence as none.

## Text, Markdown and GPU inspectors (0.9.0)

- `inspectText(entity)` — bidi base direction and per-character levels collapsed
  into runs, L2 reversal segments, the visual-order permutation, grapheme
  clusters, and per-glyph x/advance/level. `shapeProbe(text)` shapes an arbitrary
  string through the real pipeline, so a bidi or cluster question is settled
  without editing the app. `auditTextShaping(scene)` names glyphs absent from the
  atlas — those pay a canvas `measureText` each.
- `inspectMarkdownStream(entity)` — appends, worker round-trip time, and the
  stable-prefix vs changed-tail split in **characters**. Characters matter: a
  stream can reuse 95% of its tokens while re-reading 60% of its characters every
  chunk, and only the character ratio shows the O(document)-per-chunk shape.
- `inspectGpu(scene)` — backend `kind`, Canvas2D draw counters (opt-in via
  `setDrawCounters(true)`), WebGL draw calls and the POINTS-vs-quad circle split,
  WebGPU state, plus phase timings when `setPhaseTiming(true)` is on.

**These report absence honestly.** Seven capabilities return an `unavailable`
entry with a reason rather than a plausible number: glyph ids cannot exist (the
atlas is codepoint-keyed), no script itemizer exists, nothing names the font used
for a run, GPU timestamp queries need a different device request, and Canvas2D has
no pixel-coverage readback so `overdrawRatio` is a labelled proxy that overstates.
Read `unavailable` before concluding a metric is zero.

## Contributing a panel: the plugin protocol (0.9.0)

```ts
registerDevtoolsPlugin({
  id: "my-pkg",
  inspectors: [{ id: "my-view", label: "Mine", rows: ({ selection }) => [...] }],
  audits: [{ id: "sanity", run: ({ scene }) => [...] }],
  commands: [{ id: "reset", label: "Reset", run: ({ scene }) => {...} }],
});
```

Returns a deregister function. This is how `markdown`, `text`, `graph3d` and
`three` contribute panels **without** `@vectojs/devtools` importing them — a
hardcoded tab per package would invert the dependency graph. Every call into
plugin code is wrapped individually, so one broken plugin cannot take the panel
down. Entities describe themselves via `getDevtoolsDescriptor()`; DevTools holds no
table of component types, because that would gate every new component on a debug
tool change and break under minified builds where `constructor.name` is unreliable.

## Driving DevTools over a bridge (0.9.0)

`createDevtoolsBackend(scene, transport)` serves 21 methods (tree, inspect, pick,
audits, snapshot/diff, hit explanation, text, markdown, GPU, plugins, commands);
`createDevtoolsClient(transport)` issues requests with a timeout. Three
transports: an in-process pair (what the protocol is tested against, no browser
needed), `createWindowTransport` over `postMessage`, or your own.

**Origin enforcement has no permissive default.** The backend describes the whole
scene, including text content and accessible names, so a request carrying an
origin is refused unless it is in `allowedOrigins` — and omitting that option
refuses every cross-document sender. In-process callers carry no origin and are
served, which is the panel and agent path.

## Gotchas

- The panel adds its own canvas + Scene; never video-export or benchmark with the
  panel attached.
- `refreshInterval` polls; for deterministic tests set it to `0` and call the model
  functions yourself.
- Devtools is a dev dependency by nature — gate `attachDevtools` behind a dev flag
  (e.g. `location.search.includes("debug")`) so it never ships to production bundles.
- In audit tests under jsdom, use stub entities with explicit width/height — real
  ui `Text` measurement is unreliable without a canvas rasterizer.
- On `@vectojs/devtools@0.4.3+`, the dock no longer intercepts pointer input over
  the host page's right edge — the dock container and its canvas are
  `pointer-events: none`, so a real host app's own right-edge content (tab close
  buttons, toolbar buttons) sitting under the dock's 360px band stays clickable.
  Only the panel's own a11y-projected controls opt back in via `auto`. On older
  versions the dock ate every click in that band silently — if a headless
  interaction test with `?debug` on ever fails only near the right edge, rule out
  a stale devtools version before assuming the app has a real bug.
