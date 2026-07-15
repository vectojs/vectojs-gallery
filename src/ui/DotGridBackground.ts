import { Entity, type IRenderer } from "@vectojs/core";
import { COLOR } from "./tokens";

const DOT_SPACING = 22;
const MARK_SIZE = 14;
const MARK_INSET = 10;

/**
 * The catalog "bed" surface: solid ground fill, a faint repeating dot grid,
 * and four corner registration-mark crosshairs. Purely decorative —
 * `isPointInside` always returns false so it never steals clicks from the
 * cards drawn on top of it.
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

  private drawMark(r: IRenderer, x: number, y: number): void {
    r.beginPath();
    r.moveTo(x + MARK_SIZE / 2, y);
    r.lineTo(x + MARK_SIZE / 2, y + MARK_SIZE);
    r.moveTo(x, y + MARK_SIZE / 2);
    r.lineTo(x + MARK_SIZE, y + MARK_SIZE / 2);
    r.stroke(COLOR.textMuted, 1);
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.ground);

    for (let x = DOT_SPACING; x < this.width; x += DOT_SPACING) {
      for (let y = DOT_SPACING; y < this.height; y += DOT_SPACING) {
        r.beginPath();
        r.roundRect(x - 0.5, y - 0.5, 1, 1, 0);
        r.fill(COLOR.gridDot);
      }
    }

    this.drawMark(r, MARK_INSET, MARK_INSET);
    this.drawMark(r, this.width - MARK_INSET - MARK_SIZE, MARK_INSET);
    this.drawMark(r, MARK_INSET, this.height - MARK_INSET - MARK_SIZE);
    this.drawMark(r, this.width - MARK_INSET - MARK_SIZE, this.height - MARK_INSET - MARK_SIZE);
  }
}
