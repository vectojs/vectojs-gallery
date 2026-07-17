import { Entity, type IRenderer } from "@vectojs/core";
import { COLOR, FONT } from "./tokens";

/**
 * A section title + one-line subtitle, used to separate the Creations and
 * Built-on-VectoJS bands of the hub. Fixed height so the Bed's flow layout
 * can position sections without measuring.
 */
export class SectionHeader extends Entity {
  constructor(
    width: number,
    private readonly title: string,
    private readonly subtitle: string,
  ) {
    super(`SectionHeader:${title}`);
    this.width = width;
    this.height = 64;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.fillText(this.title, 0, 26, FONT.display(22), COLOR.textPrimary);
    r.fillText(this.subtitle, 0, 50, FONT.body(13), COLOR.textFaint);
  }
}
