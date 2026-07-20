/**
 * Canvas-backed `GlyphMeasurer` for raw `LayoutEngine` usage inside the
 * compare-pretext demos (accordion/masonry compute exact panel/card heights
 * via `LayoutEngine.prepare()` directly, the same mechanic `@vectojs/ui`'s
 * own `Text` component uses internally — see `Text.ts`'s private
 * `fontMeasurer`). Without a real measurer the engine falls back to a
 * portable `0.5em` heuristic, which would make card/panel heights visibly
 * wrong for proportional fonts.
 */
import type { GlyphMeasurer } from "@vectojs/core";

const cache = new Map<string, Map<string, number>>();

export function fontMeasurer(font: string): GlyphMeasurer | null {
  if (typeof document === "undefined") return null;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  let byChar = cache.get(font);
  if (!byChar) {
    byChar = new Map<string, number>();
    cache.set(font, byChar);
  }
  return {
    measure(char: string): number {
      let w = byChar!.get(char);
      if (w === undefined) {
        ctx.font = font;
        w = ctx.measureText(char).width;
        byChar!.set(char, w);
      }
      return w;
    },
  };
}
