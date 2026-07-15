import type { Entity } from "@vectojs/core";

/** One showcased creation: a lazily-loaded root `Entity` plus its catalog metadata. */
export interface Creation {
  id: string;
  title: string;
  description: string;
  tags: string[];
  // A dynamic import thunk, not a direct class reference: each creation
  // becomes its own lazy-loaded chunk, so the initial bundle only ever pays
  // for creations a visitor actually opens.
  load: () => Promise<{ default: new () => Entity }>;
}

// Registry of creations. Each ported demo is added by its own dedicated
// implementation plan (see
// superpowers/tasks/2026-07-15-vectojs-gallery-redesign/plans/).
export const CREATIONS: Creation[] = [
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
    id: "dimension",
    title: "Dimension",
    description:
      "A VectoJS control panel floating in real 3D space — drag to orbit, and every click is raycast through the plane into a fully interactive 2D UI underneath.",
    tags: ["WebGL", "Three.js", "3D"],
    load: () => import("./creations/dimension"),
  },
  {
    id: "chat",
    title: "AI Chat — streaming Markdown",
    description:
      "A chat reply streaming token-by-token on canvas: headings, lists, code, tables, and SVG-rendered math, all laid out incrementally with zero DOM per token.",
    tags: ["Streaming", "Markdown"],
    load: () => import("./creations/chat"),
  },
];
