/**
 * Shared visual tokens for the compare-pretext sub-demos. Two families,
 * matching the reference site's own two visual languages (see the pretext
 * demos report): a warm cream/brown "editorial marketing page" family
 * (accordion, bubbles, rich-note, masonry, justification) and a dark
 * "full-viewport canvas" family (dynamic-layout, editorial-engine,
 * variable-typographic-ascii). markdown-chat owns its own dark app-chrome
 * palette (closer to a real chat product than either family).
 */

export const WARM = {
  page: "#f5f1ea",
  pageTop: "#fbf7f0",
  panel: "#fffdf8",
  ink: "#201b18",
  muted: "#6d645d",
  faint: "#8f857b",
  rule: "#d8cec3",
  accent: "#955f3b",
  accentSoft: "#c99b6f",
} as const;

export const DARK = {
  page: "#0a0a0c",
  pageAlt: "#0f0f14",
  panel: "#14141b",
  ink: "#f1f0ee",
  muted: "#9a978f",
  faint: "#6b6862",
  rule: "#262630",
  accent: "#7c5cff",
  accentSoft: "#22d3ee",
} as const;

export const FONT = {
  serifDisplay: (px: number) => `700 ${px}px Georgia, "Times New Roman", serif`,
  mono: (px: number) => `${px}px "SF Mono", ui-monospace, monospace`,
  sans: (px: number, weight = 400) =>
    `${weight} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
} as const;

/** Card metadata for the launcher grid — mirrors pretext's own /demos index.html copy. */
export interface DemoCardInfo {
  id: string;
  title: string;
  description: string;
}

export const DEMO_CARDS: DemoCardInfo[] = [
  {
    id: "accordion",
    title: "Accordion",
    description:
      "Expand and collapse sections whose text heights are calculated ahead of time — zero layout shift, on a canvas that never had DOM reflow to begin with.",
  },
  {
    id: "bubbles",
    title: "Bubbles",
    description:
      "Tight multiline message bubbles that keep the same line count with less wasted area, found by a binary search over cached glyph widths.",
  },
  {
    id: "dynamic-layout",
    title: "Dynamic Layout",
    description:
      "A fixed-height editorial spread with obstacle-aware title routing and continuous multi-column flow.",
  },
  {
    id: "variable-typographic-ascii",
    title: "Variable Typographic ASCII",
    description:
      "Particle-driven ASCII art comparing proportional measured glyphs against a monospace version.",
  },
  {
    id: "editorial-engine",
    title: "Editorial Engine",
    description:
      "Animated orbs, live text reflow, pull quotes, and multi-column flow, computed every frame without a single DOM read.",
  },
  {
    id: "justification-comparison",
    title: "Justification Comparison",
    description:
      "Greedy hyphenation and Knuth-Plass paragraph layout shown side by side to reveal rivers and spacing tradeoffs.",
  },
  {
    id: "rich-note",
    title: "Rich Text",
    description:
      "Rich inline text, code spans, links, and chips laid out together — pills stay whole while the text keeps wrapping naturally.",
  },
  {
    id: "markdown-chat",
    title: "Markdown Chat",
    description:
      "A virtualized chat demo rendering ten thousand markdown messages with rich inline flow and preserved-whitespace code blocks.",
  },
  {
    id: "masonry",
    title: "Masonry",
    description:
      "A text-card masonry layout where every card's exact height is known before it's ever placed on screen.",
  },
];
