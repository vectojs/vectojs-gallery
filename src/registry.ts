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
];
