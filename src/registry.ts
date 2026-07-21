import type { Entity } from "@vectojs/core";

/** One showcased creation: a lazily-loaded root `Entity` plus its catalog metadata. */
export interface Creation {
  id: string;
  title: string;
  description: string;
  tags: string[];
  /**
   * Backdrop colour the workspace Stage paints behind this creation. Part of
   * the creation theme contract (AGENTS.md): a creation authored for a light
   * ground declares it here instead of relying on the default dark theater.
   */
  stage?: string;
  /**
   * Extra pixels the shared bottom-left CaptionPlate reserves above its
   * default anchor, for creations that draw their own interactive chrome
   * along the bottom edge (e.g. Stream Reader's File/Play/Pause/rate bar) —
   * without this the plate's expanded card, and even its collapsed "i" tab,
   * sit directly on top of that chrome and block its buttons. Part of the
   * creation theme contract (AGENTS.md), same idea as `stage`.
   */
  bottomInset?: number;
  /**
   * Whether the shared Scene should be forced to redraw every frame while
   * this creation is open, bypassing the core idle-throttle entirely.
   * Defaults to `true` (unset) — most creations here animate by mutating
   * their own state in `update()` without ever calling `scene.markDirty()`
   * themselves, so they need the forced pump to stay visible (see
   * `main.ts`'s `keepSceneLive`). Set `false` for a creation that already
   * calls `scene.markDirty()` at every point its own visuals actually
   * change: the cost of full-scene forced redraw scales with total
   * on-screen content, so for a content-heavy creation (e.g. a long
   * rendered document) forcing it forever is real, needless per-frame cost
   * once nothing is left to animate. See forge/findings.md 2026-07-19.
   */
  continuousRedraw?: boolean;
  // A dynamic import thunk, not a direct class reference: each creation
  // becomes its own lazy-loaded chunk, so the initial bundle only ever pays
  // for creations a visitor actually opens.
  load: () => Promise<{ default: new () => Entity }>;
}

// Registry of creations. Each ported creation is added by its own dedicated
// implementation plan (see
// superpowers/tasks/2026-07-15-vectojs-gallery-redesign/plans/).
// Ordered alphabetically by `title` — the Rail's list and the Bed's grid both
// render CREATIONS in array order, so sorting here sorts both surfaces.
export const CREATIONS: Creation[] = [
  {
    id: "studio",
    title: "Canvas Studio — a Fabric.js-style editor",
    description:
      "Fabric.js's interactive object model, rebuilt from first principles on VectoJS: drag, scale from 8 oriented handles, rotate, band-select and group-move, reorder z-depth, and serialize the whole scene to JSON and back — every shape a plain numeric record, every handle computed geometry.",
    tags: ["Editor", "Interaction", "Serialization"],
    stage: "#f2efe8",
    // Every mutation here happens inside a raw pointer/keyboard handler that
    // doesn't call scene.markDirty(), so it relies on the forced-redraw pump
    // (same as `catch`) — leave continuousRedraw at its default (true).
    load: () => import("./creations/studio"),
  },
  {
    id: "dimension",
    title: "Dimension",
    description:
      "A VectoJS control panel floating in real 3D space — drag to orbit, and every click is raycast through the plane into a fully interactive 2D UI underneath.",
    tags: ["WebGL", "Three.js", "3D"],
    load: () => import("./creations/dimension"),
  },
  {
    id: "catch",
    title: "Fruit Catch",
    description:
      "A falling-fruit catcher, osu!Catch-style: move the plate with your mouse or arrow keys to grab the fruit the goal asks for.",
    tags: ["Interaction", "Game"],
    load: () => import("./creations/catch"),
  },
  {
    id: "nexus",
    title: "Nexus — a WebGPU particle field",
    description:
      'Tens of thousands of particles simulated on a WebGPU compute pass — springing into the word "VectoJS" and flowing away from your cursor, with a transparent CPU fallback.',
    tags: ["WebGPU", "Compute", "particles"],
    load: () => import("./creations/nexus"),
  },
  {
    id: "compare-pretext",
    title: "Pretext, Rebuilt on VectoJS",
    description:
      "Nine public demos from the pretext text-layout library, reimplemented on VectoJS's own canvas-native layout engine — no DOM reflow to avoid, because there was never any DOM to reflow.",
    tags: ["Text Layout", "Comparison", "Typography"],
    stage: "#f5f1ea",
    // Every interaction here (opening a demo, dragging a slider, toggling
    // an accordion row) already calls scene.markDirty() itself through the
    // normal @vectojs/ui component event handlers — like `chat`, it never
    // needs the blanket forced-redraw pump once idle.
    continuousRedraw: false,
    load: () => import("./creations/compare-pretext"),
  },
  {
    id: "chat",
    title: "Stream Reader — Markdown & EPUB",
    description:
      "Drop a .txt/.md/.epub file and it streams character-by-character at an adjustable rate: incremental plain-text layout, or @vectojs/ui Markdown with math, tables, and code, all off the main thread.",
    tags: ["Streaming", "Markdown", "EPUB"],
    stage: "#f7f2e8",
    // Reserve space above the control bar (56px desktop / 90px mobile, see
    // ControlPanel.panelHeight) plus a clear gap.
    bottomInset: 106,
    // Every visual change here (streaming ticks, scroll, image load,
    // control-panel interaction) already calls scene.markDirty() itself —
    // it never needed the blanket forced-redraw pump, and paid its full
    // per-frame content-repaint cost for nothing once a long document
    // finished loading and sat idle.
    continuousRedraw: false,
    load: () => import("./creations/chat"),
  },
];
