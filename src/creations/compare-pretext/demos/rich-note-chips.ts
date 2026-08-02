/**
 * Atomic inline chips for the Rich Text demo, as pre-rasterized InlineObjects.
 *
 * Why rasterize instead of drawing paths: `InlineObjectSurface` deliberately
 * exposes only `drawImage`/`drawImageRect` — no `roundRect`, no `fill`. The
 * surface type lives in `@vectojs/layout` (re-exported by `@vectojs/core`),
 * which sits below core and therefore cannot reference `IRenderer`. So a chip's
 * rounded body has to be painted once onto an offscreen canvas and blitted.
 *
 * Why `alt` must uniquely determine appearance: `InlineObject.paint` is
 * deliberately NOT part of the paragraph memo key, while `alt` IS. Two objects
 * with identical metrics and identical `alt` but different `paint` closures
 * share a cached paragraph, and the second one is served the FIRST one's
 * closure. Encoding the tone into `alt` keeps that collision unreachable.
 */

import type { InlineObject } from '@vectojs/core';
import { FONT } from '../shared/theme';

/** Chip palette, one entry per semantic tone used by the standup sentence. */
export const CHIP_TONE = {
  mention: { bg: '#dbeafe', fg: '#1d4ed8' },
  status: { bg: '#fde8d8', fg: '#b45309' },
  priority: { bg: '#fee2e2', fg: '#b91c1c' },
  time: { bg: '#dcfce7', fg: '#15803d' },
  count: { bg: '#ede9fe', fg: '#6d28d9' },
} as const;

export type ChipTone = keyof typeof CHIP_TONE;

/**
 * Horizontal chrome added to a chip's natural label width. Matches pretext's
 * `CHIP_CHROME_WIDTH`, so a chip occupies the same advance in both ports.
 */
export const CHIP_CHROME_WIDTH = 22;

/** Chip box height. Matches pretext's chip block height. */
export const CHIP_HEIGHT = 24;

/**
 * How far a chip's box extends below the text baseline. Centers the 24px box on
 * a 17px run's visual middle instead of hanging it off the baseline.
 */
export const CHIP_DEPTH = 6;

export const CHIP_FONT = FONT.sans(12, 700);

/** Corner radius: fully rounded, so the pill reads as a chip at any width. */
const CHIP_RADIUS = CHIP_HEIGHT / 2;

/**
 * Device pixel ratio to rasterize chips at. Chips are blitted at CSS-pixel
 * size, so a 2x backing store keeps the label crisp on HiDPI without asking
 * the caller to thread DPR through the span builder.
 */
const CHIP_RASTER_DPR = 2;

/** Width per character used only when no canvas is available to measure with. */
const FALLBACK_CHAR_WIDTH = 7;

/** Measures a label at {@link CHIP_FONT}. Injectable so tests need no canvas. */
export type LabelMeasurer = (label: string) => number;

type ChipCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Cache of rasterized chips keyed by everything that affects the pixels. The
 * same label+tone appearing twice reuses one bitmap.
 */
const rasterCache = new Map<string, ChipCanvas>();

/** Measurement canvas, kept alive so label widths do not allocate per call. */
let measureCtx: CanvasRenderingContext2D | null = null;
let measureCtxTried = false;

/** Canvas-backed measurer. Falls back to a per-character estimate headlessly. */
export function measureChipLabel(label: string): number {
  if (!measureCtxTried) {
    measureCtxTried = true;
    measureCtx =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return label.length * FALLBACK_CHAR_WIDTH;
  measureCtx.font = CHIP_FONT;
  return measureCtx.measureText(label).width;
}

/**
 * A chip's total advance: the label plus the chrome it is drawn inside.
 *
 * Kept separate from {@link chipObject} so the arithmetic is assertable without
 * a canvas, and so the raster and the reserved advance cannot disagree.
 */
export function chipWidth(label: string, measure: LabelMeasurer = measureChipLabel): number {
  return measure(label) + CHIP_CHROME_WIDTH;
}

/** Cache key covering every input that changes a chip's pixels. */
export function chipRasterKey(label: string, tone: ChipTone, width: number): string {
  return `${tone}|${label}|${width.toFixed(2)}`;
}

/** The accessible/copyable text a chip contributes in place of its sentinel. */
export function chipAlt(label: string, tone: ChipTone): string {
  return `${label} (${tone})`;
}

function rasterizeChip(label: string, tone: ChipTone, width: number): ChipCanvas | null {
  const key = chipRasterKey(label, tone, width);
  const cached = rasterCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * CHIP_RASTER_DPR);
  canvas.height = Math.ceil(CHIP_HEIGHT * CHIP_RASTER_DPR);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(CHIP_RASTER_DPR, CHIP_RASTER_DPR);
  const palette = CHIP_TONE[tone];

  ctx.beginPath();
  ctx.roundRect(0, 0, width, CHIP_HEIGHT, CHIP_RADIUS);
  ctx.fillStyle = palette.bg;
  ctx.fill();

  // Center the label on the box rather than offsetting from the top edge: the
  // previous entity-based chip left `Text.lineHeight` at its default and drew
  // at 0.8x that, landing the baseline 4.5px below the body text.
  ctx.font = CHIP_FONT;
  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, CHIP_HEIGHT / 2);

  rasterCache.set(key, canvas);
  return canvas;
}

/**
 * Build the InlineObject for one chip.
 *
 * The returned object carries its own metrics in final pixels — the engine does
 * not scale an object by the surrounding run's font size, unlike a glyph.
 */
export function chipObject(
  label: string,
  tone: ChipTone,
  measure: LabelMeasurer = measureChipLabel,
): InlineObject {
  const width = chipWidth(label, measure);
  return {
    width,
    height: CHIP_HEIGHT,
    depth: CHIP_DEPTH,
    // Tone is encoded so `alt` uniquely determines the pixels (see file header).
    alt: chipAlt(label, tone),
    paint: (surface, box) => {
      const raster = rasterizeChip(label, tone, width);
      if (!raster) return;
      surface.drawImage(raster, box.x, box.y, box.width, box.height);
    },
  };
}

/** Clear the raster cache. Exposed for teardown so bitmaps are not retained. */
export function clearChipRasterCache(): void {
  rasterCache.clear();
}
