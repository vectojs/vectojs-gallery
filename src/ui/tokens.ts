/**
 * Design tokens for the warm-white, canvas-native gallery chrome. The base
 * palette is a warm cream ground with a single coral ink accent for shared
 * chrome; each creation additionally owns a signature gradient (see ACCENT)
 * that drives its card thumbnail, accent rule, rail dot, and hover glow.
 */
export const COLOR = {
  void: "#f7f4ee",
  ground: "#faf7f1",
  groundRaised: "#fdfcfa",
  groundSunk: "#f5f1e9",
  ink: "#d97757",
  inkDim: "#b87b52",
  textPrimary: "#3d3529",
  textMuted: "#6b6254",
  textFaint: "#a89e8c",
  rule: "#ece7de",
  ruleBright: "#d8d0c2",
  gridDot: "rgba(61, 53, 41, 0.05)",
} as const;

/**
 * A creation's signature colour identity. `a`/`b` are the two stops of its
 * gradient (top-left to bottom-right); `glow` is a solid colour layered at low
 * alpha behind the card on hover to fake a radial bloom (the renderer has only
 * linear gradients, so glow is composited via setGlobalAlpha).
 */
export interface Accent {
  readonly a: string;
  readonly b: string;
  readonly glow: string;
}

/**
 * Shared chrome accent gradient (logo tile, masthead brand-word) — distinct
 * from any individual creation's own Accent. Matches the Motif site's
 * brand-a/brand-b (2026-07-17-motif-light-theme.md decision 1).
 */
export const BRAND_GRADIENT: Accent = {
  a: "#d97757",
  b: "#f2b880",
  glow: "#d97757",
};

/** Per-creation accent, keyed by `Creation.id`. */
export const ACCENT: Record<string, Accent> = {
  catch: { a: "#ff6b3d", b: "#ffb03a", glow: "#ff823c" },
  nexus: { a: "#7c5cff", b: "#22d3ee", glow: "#7c5cff" },
  dimension: { a: "#ff4d8d", b: "#a855f7", glow: "#ff4d8d" },
  chat: { a: "#b4823c", b: "#e8c887", glow: "#c49a54" },
  "compare-pretext": { a: "#955f3b", b: "#d8ae7c", glow: "#955f3b" },
  studio: { a: "#4f46e5", b: "#06b6d4", glow: "#4f46e5" },
} as const;

const FALLBACK_ACCENT: Accent = { a: "#7c5cff", b: "#22d3ee", glow: "#7c5cff" };

/** Accent for a creation id, falling back to the brand violet→cyan. */
export function accentFor(id: string): Accent {
  return ACCENT[id] ?? FALLBACK_ACCENT;
}

export const FONT = {
  display: (px: number) =>
    `400 ${px}px "Archivo Black", "Arial Black", sans-serif`,
  body: (px: number) =>
    `${px}px Inter, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
  mono: (px: number) =>
    `${px}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`,
} as const;
