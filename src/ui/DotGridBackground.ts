import { Entity, type IRenderer } from "@vectojs/core";
import { COLOR, BRAND_GRADIENT } from "./tokens";
import { drawBloom } from "./bloom";

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

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.void);

    drawBloom(r, this.width * 0.82, this.height * 0.12, 260, BRAND_GRADIENT.b);
    drawBloom(r, this.width * 0.1, this.height * 0.9, 220, BRAND_GRADIENT.a);

    for (let x = DOT_SPACING; x < this.width; x += DOT_SPACING) {
      for (let y = DOT_SPACING; y < this.height; y += DOT_SPACING) {
        r.beginPath();
        r.roundRect(x - 0.5, y - 0.5, 1, 1, 0);
        r.fill(COLOR.gridDot);
      }
    }
  }
}
