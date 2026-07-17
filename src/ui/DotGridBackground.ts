import { Entity, type IRenderer } from "@vectojs/core";
import { COLOR, BRAND_GRADIENT } from "./tokens";

const DOT_SPACING = 26;

/**
 * The catalog "bed" surface: solid ground fill, a very faint dot grid, and two
 * corner ambient blooms. Purely a fixed backdrop — the masthead moved into the
 * scrollable hub content (see Masthead) so it scrolls with the sections.
 * `isPointInside` always returns false so it never steals clicks from the cards.
 */
export class DotGridBackground extends Entity {
  constructor(width: number, height: number) {
    super("DotGridBackground");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  /**
   * Fakes a radial bloom the linear-gradient-only renderer cannot draw: a few
   * concentric arcs painted at low alpha in the accent colour, densest at the
   * centre. Alpha is always restored to 1 so later draws are unaffected.
   */
  private drawBloom(
    r: IRenderer,
    x: number,
    y: number,
    radius: number,
    color: string,
  ): void {
    const layers = 5;
    for (let i = layers; i >= 1; i--) {
      r.setGlobalAlpha(0.03 * (layers - i + 1));
      r.beginPath();
      r.arc(x, y, (radius * i) / layers, 0, Math.PI * 2);
      r.fill(color);
    }
    r.setGlobalAlpha(1);
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.void);

    this.drawBloom(
      r,
      this.width * 0.82,
      this.height * 0.12,
      260,
      BRAND_GRADIENT.b,
    );
    this.drawBloom(
      r,
      this.width * 0.1,
      this.height * 0.9,
      220,
      BRAND_GRADIENT.a,
    );

    for (let x = DOT_SPACING; x < this.width; x += DOT_SPACING) {
      for (let y = DOT_SPACING; y < this.height; y += DOT_SPACING) {
        r.beginPath();
        r.roundRect(x - 0.5, y - 0.5, 1, 1, 0);
        r.fill(COLOR.gridDot);
      }
    }
  }
}
