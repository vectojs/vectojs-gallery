import type { IRenderer } from "@vectojs/core";

/**
 * Fakes a radial bloom the linear-gradient-only renderer cannot draw: a few
 * concentric arcs painted at low alpha in the given colour, densest at the
 * centre. Alpha is always restored to 1 so later draws are unaffected. Shared
 * by the catalog's DotGridBackground and the Stage theater backdrop so both
 * surfaces read as the same warm, soft world.
 */
export function drawBloom(
  r: IRenderer,
  x: number,
  y: number,
  radius: number,
  color: string,
  peakAlpha = 0.03,
): void {
  const layers = 5;
  for (let i = layers; i >= 1; i--) {
    r.setGlobalAlpha(peakAlpha * (layers - i + 1));
    r.beginPath();
    r.arc(x, y, (radius * i) / layers, 0, Math.PI * 2);
    r.fill(color);
  }
  r.setGlobalAlpha(1);
}
