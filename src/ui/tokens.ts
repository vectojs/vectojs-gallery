/** Palette, pulled from tmp/design/gallery-redesign-mockup.html (single-ink variant). */
export const COLOR = {
  ground: "#12151b",
  groundRaised: "#1a1e26",
  groundSunk: "#0c0e13",
  ink: "#e0a458",
  inkDim: "#8a6a3f",
  textPrimary: "#eef0f2",
  textMuted: "#8a919c",
  textFaint: "#565c66",
  rule: "rgba(255, 255, 255, 0.09)",
  gridDot: "rgba(255, 255, 255, 0.05)",
} as const;

export const FONT = {
  display: (px: number) =>
    `800 ${px}px "Archivo Black", "Arial Black", sans-serif`,
  body: (px: number) =>
    `${px}px -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
  mono: (px: number) =>
    `${px}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`,
} as const;
