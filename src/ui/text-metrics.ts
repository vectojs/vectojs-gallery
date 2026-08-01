/**
 * Real text measurement for canvas-drawn labels.
 *
 * `IRenderer` deliberately exposes no `measureText` — it is an abstraction over
 * Canvas2D, WebGL and WebGPU backends, and only the first can measure cheaply.
 * Demos that draw their own chrome therefore used to estimate width from the
 * glyph count (`text.length * px * 0.56`), which is wrong by -7.1% to +20.1% on
 * the labels this gallery actually draws (measured in Chrome 150 against
 * `600 13px Inter, system-ui`: `Ellipse` +20.1%, `Load` -7.1%). That is fine for
 * a rough centering nudge and **not** fine for a hit box: an `Ellipse` button
 * came out 8.5px wider than its glyphs while `Load` came out 2.2px narrower, so
 * clicks near an edge hit the wrong button or nothing at all.
 *
 * A single offscreen 1x1 canvas answers the question exactly. Results are cached
 * per `font`+`text` pair because these labels are static and re-measuring on
 * every frame would trade a correctness bug for a perf one.
 */

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  ctx = canvas.getContext('2d');
  return ctx;
}

/**
 * Width in CSS pixels of `text` rendered in `font`, where `font` is a full
 * Canvas2D font shorthand (`'600 13px Inter, system-ui'`).
 *
 * Falls back to a glyph-count estimate only when there is no DOM at all (unit
 * tests under Bun), so callers never have to branch.
 */
export function textWidth(text: string, font: string): number {
  if (!text) return 0;
  const key = `${font}\u0000${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const c = context();
  let width: number;
  if (c) {
    c.font = font;
    width = c.measureText(text).width;
  } else {
    // No DOM: keep the old estimate rather than throwing. `px` is parsed out of
    // the shorthand so this still scales with font size.
    const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '13');
    width = text.length * px * 0.56;
  }
  cache.set(key, width);
  return width;
}

/** Left edge for `text` centered on `cx`, using the real measured width. */
export function centerX(text: string, font: string, cx: number): number {
  return cx - textWidth(text, font) / 2;
}

/** Drop cached measurements. Only needed if a webfont loads after first paint. */
export function clearTextWidthCache(): void {
  cache.clear();
}
