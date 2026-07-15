/**
 * Prebaked questions + Markdown answers so the demo shows everything with zero
 * configuration. Each answer streams token-by-token at the chosen tokens/sec,
 * exercising the engine's incremental Markdown rendering (headings, lists, tables,
 * blockquotes, fenced code). Answers are about VectoJS itself.
 */
export interface QA {
  q: string;
  a: string;
}

export const SAMPLES: QA[] = [
  {
    q: "What can I do with VectoJS?",
    a: `## What you can build with VectoJS

VectoJS renders an entire UI in **one \`<canvas>\`** — no per-element DOM — while
staying accessible and automatable. A few things it's good at:

- **Data-dense views**: thousands of live entities at 60fps (the danmaku demo holds
  ~5000 comments; the particle field, 150k points).
- **Rich streaming text** — like this message, laid out incrementally as tokens arrive.
- **Agent-driven UIs**: every interactive entity projects a real ARIA shadow node, so
  Playwright or an AI agent can \`getByRole().click()\` it.
- **Reflowing typography**: text re-wraps on resize and browser zoom — measure once,
  re-wrap for free.

| Surface | DOM nodes | Notes |
| --- | --- | --- |
| 5000 danmaku | ~3 | one canvas |
| 150k particles | 0 | WebGL / WebGPU points |
| this chat | a handful | canvas transcript |

> This whole reply is one canvas. The transcript holds a handful of DOM nodes, not
> one per token.

\`\`\`ts
import { Scene } from '@vectojs/core';
const scene = new Scene(canvas, { maxFPS: 60 });
scene.start();
\`\`\``,
  },
  {
    q: "What is the underlying principle of VectoJS?",
    a: `## The underlying principle

Everything is **math on a canvas**. Layout, hit-testing, and animation are pure
functions over a virtual tree — the browser never reflows.

Each frame is a small, fixed pipeline:

\`\`\`ts
// per frame, walking the Virtual Math Tree
update(dt)              // advance tweens + spring physics
  → getBounds() cull    // skip entities outside the viewport
  → render(IRenderer)   // Canvas2D / WebGL / WebGPU
  → syncA11y()          // reposition the real shadow-DOM nodes
\`\`\`

Layout uses a **cold/hot split**: an expensive \`prepare()\` measures glyphs once,
then a cheap \`layoutPrepared()\` re-wraps on every resize — so responsive text
reflow is essentially free.

| Phase | Cost | Runs |
| --- | --- | --- |
| \`prepare()\` | expensive | once per content change |
| \`layoutPrepared()\` | cheap | every resize |

> No style recalculation, no layout thrash — just arithmetic over a plain object graph.`,
  },
  {
    q: "What can VectoJS do that the DOM cannot?",
    a: `## Beyond the DOM

The DOM reflows and repaints on every change and chokes past a few hundred animated
nodes. VectoJS keeps the **node count flat** while animating thousands of things,
because they're not nodes at all — they're entries in a math tree.

It can also express things the DOM has no primitive for:

- **Concave, pixel-perfect hit-testing** — \`isPointInside()\` can be any shape, not a box.
- **Canvas-to-canvas compositing** — blend modes and clips with no CSS equivalent.
- **The whole UI as a texture** — rendered onto a 3D mesh via \`THREE.CanvasTexture\` in WebXR.

\`\`\`ts
class Ring extends Entity {
  isPointInside(x, y) {
    const d = Math.hypot(x - this.cx, y - this.cy);
    return d > this.inner && d < this.outer; // a hole no <div> can hit-test
  }
}
\`\`\`

…and it still exposes a semantic shadow layer for screen readers and agents. So you
get canvas performance **and** DOM-grade accessibility — not one or the other.`,
  },
];
