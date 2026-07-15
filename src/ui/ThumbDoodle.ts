import { Entity, type IRenderer } from "@vectojs/core";
import { COLOR } from "./tokens";

/** A small seeded Lissajous-curve doodle standing in for a per-entry preview image. */
export class ThumbDoodle extends Entity {
  constructor(
    width: number,
    height: number,
    private readonly seed: number,
  ) {
    super("ThumbDoodle");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.groundSunk);

    const passes = 1 + (this.seed % 3);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const rx = this.width / 2 - 6;
    const ry = this.height / 2 - 6;

    for (let p = 0; p < passes; p++) {
      const a = 2 + ((this.seed * 7 + p * 3) % 5);
      const b = 3 + ((this.seed * 5 + p * 2) % 4);
      const delta = (this.seed * 0.6 + p * 1.1) % Math.PI;

      r.beginPath();
      const steps = 96;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = cx + rx * Math.sin(a * t + delta);
        const y = cy + ry * Math.sin(b * t);
        if (i === 0) r.moveTo(x, y);
        else r.lineTo(x, y);
      }
      r.stroke(COLOR.ink, 1);
    }
  }
}
