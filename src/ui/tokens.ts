/**
 * Design tokens for the bold, canvas-native gallery chrome. The base palette
 * is a deep near-black with a single warm ink accent for shared chrome; each
 * creation additionally owns a signature gradient (see ACCENT) that drives its
 * card thumbnail, accent rule, rail dot, and hover glow.
 */
export const COLOR = {
  void: "#06070a",
  ground: "#0b0d12",
  groundRaised: "#14171f",
  groundSunk: "#1b1f29",
  ink: "#e0a458",
  inkDim: "#8a6a3f",
  textPrimary: "#f4f6f8",
  textMuted: "#9aa3b0",
  textFaint: "#5a6472",
  rule: "rgba(255, 255, 255, 0.08)",
  ruleBright: "rgba(255, 255, 255, 0.16)",
  gridDot: "rgba(255, 255, 255, 0.045)",
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

/** Per-creation accent, keyed by `Creation.id`. */
export const ACCENT: Record<string, Accent> = {
  catch: { a: "#ff6b3d", b: "#ffb03a", glow: "#ff823c" },
  nexus: { a: "#7c5cff", b: "#22d3ee", glow: "#7c5cff" },
  dimension: { a: "#ff4d8d", b: "#a855f7", glow: "#ff4d8d" },
  chat: { a: "#22c55e", b: "#a3e635", glow: "#22c55e" },
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
    `${px}px -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
  mono: (px: number) =>
    `${px}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`,
} as const;
