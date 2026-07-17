import { Entity, type IRenderer } from "@vectojs/core";

/**
 * A plain dark backdrop mounted behind an open creation (never in the catalog
 * view). Every creation was authored assuming the gallery's original dark
 * surface behind it — most paint an opaque full-bleed background, but
 * ready-screens and transparent UIs (e.g. Chat's bubble Stack, Fruit Catch's
 * start screen) rely on a dark backdrop showing through for their light text
 * and glows to read. When the shared chrome went warm-white, that assumption
 * broke. Rather than recolor every creation (they are content, out of scope),
 * this Stage restores the dark backdrop *only* while a creation is showing, so
 * the catalog, rail, and masthead stay light while each creation renders in the
 * dark "theater" it was designed for. Added to the scene before the creation
 * entity so it always paints behind it.
 */
const STAGE_FILL = "#06070a";

export class Stage extends Entity {
  constructor(width: number, height: number) {
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
    r.fill(STAGE_FILL);
  }
}
