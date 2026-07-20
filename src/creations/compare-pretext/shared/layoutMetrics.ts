/**
 * Small helpers for driving `LayoutEngine` directly with pretext-shaped
 * semantics (`walkLineRanges`'s per-line max width, `layout()`'s line count
 * at a width) — used by demos that need per-line geometry rather than just
 * the final positioned glyphs `@vectojs/ui`'s `Text` already exposes.
 */
import { LayoutEngine, type PreparedText } from "@vectojs/core";

export interface LineMetrics {
  lineCount: number;
  height: number;
  maxLineWidth: number;
}

/**
 * Groups a `layoutPrepared()` result's glyphs back into visual lines (same
 * `y / (fontSize * 1.5)` quantization `@vectojs/ui`'s `Text.applyLayout`
 * uses internally) and reports line count, total height, and the widest
 * line — the direct analog of pretext's `walkLineRanges()` max-width scan.
 */
export function layoutMetrics(
  engine: LayoutEngine,
  prepared: PreparedText,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
): LineMetrics {
  const savedWidth = engine.maxWidth;
  engine.maxWidth = maxWidth;
  const result = engine.layoutPrepared(prepared);
  engine.maxWidth = savedWidth;

  const lineQuantum = fontSize * 1.5;
  const lineMaxX = new Map<number, number>();
  let maxIdx = -1;
  for (const node of result.nodes) {
    const idx = Math.round(node.y / lineQuantum);
    const end = node.x + node.width;
    if (end > (lineMaxX.get(idx) ?? 0)) lineMaxX.set(idx, end);
    if (idx > maxIdx) maxIdx = idx;
  }
  const lineCount = Math.max(1, maxIdx + 1);
  let maxLineWidth = 0;
  for (const w of lineMaxX.values()) if (w > maxLineWidth) maxLineWidth = w;

  return { lineCount, height: lineCount * lineHeight, maxLineWidth };
}

/**
 * Binary search for the narrowest `maxWidth` that still produces the same
 * line count as at `atWidth` — pretext's "shrinkwrap" trick (bubbles demo):
 * the tightest CSS width that preserves the wrap, found as pure arithmetic
 * over cached glyph widths, no DOM round-trips.
 */
export function findTightWrapMetrics(
  engine: LayoutEngine,
  prepared: PreparedText,
  atWidth: number,
  lineHeight: number,
  fontSize: number,
): LineMetrics {
  const initial = layoutMetrics(
    engine,
    prepared,
    atWidth,
    lineHeight,
    fontSize,
  );
  let lo = 1;
  let hi = Math.max(1, Math.ceil(atWidth));
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midLineCount = layoutMetrics(
      engine,
      prepared,
      mid,
      lineHeight,
      fontSize,
    ).lineCount;
    if (midLineCount <= initial.lineCount) hi = mid;
    else lo = mid + 1;
  }
  return layoutMetrics(engine, prepared, lo, lineHeight, fontSize);
}
