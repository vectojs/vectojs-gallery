import { Entity, type IRenderer } from "@vectojs/core";
import { BRAND_GRADIENT } from "./tokens";
import { drawBloom } from "./bloom";

/**
 * A dark backdrop mounted behind an open creation (never in the catalog
 * view). Every creation was authored assuming the gallery's original dark
 * surface behind it — most paint an opaque full-bleed background, but
 * ready-screens and transparent UIs (e.g. Chat's bubble Stack, Fruit Catch's
 * start screen) rely on a dark backdrop showing through for their light text
 * and glows to read. Rather than recolor every creation (they are content,
 * out of scope), this Stage restores a dark backdrop *only* while a creation
 * is showing, so the catalog, rail, and masthead stay light while each
 * creation renders in the dark "theater" it was designed for.
 *
 * The fill itself is a warm near-black (not a cold blue-black) and carries
 * the same soft coral/peach corner blooms as the catalog's
 * DotGridBackground, so switching between the light catalog and the dark
 * theater reads as one warm, soft world rather than two disconnected
 * surfaces. Added to the scene before the creation entity so it always
 * paints behind it.
 */
export const DEFAULT_STAGE_FILL = "#170f09";

export class Stage extends Entity {
  constructor(
    width: number,
    height: number,
    private readonly fill: string = DEFAULT_STAGE_FILL,
  ) {
    super("Stage");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(this.fill);

    drawBloom(
      r,
      this.width * 0.85,
      this.height * 0.08,
      280,
      BRAND_GRADIENT.b,
      0.05,
    );
    drawBloom(
      r,
      this.width * 0.08,
      this.height * 0.95,
      240,
      BRAND_GRADIENT.a,
      0.05,
    );
  }
}
