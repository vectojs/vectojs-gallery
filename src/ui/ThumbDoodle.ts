import { Entity, type IRenderer } from "@vectojs/core";
import type { Accent } from "./tokens";

const PANEL_RADIUS = 10;
const MOTIF_INSET = 18;

/**
 * A static per-creation preview panel: a diagonal accent gradient (top-left →
 * bottom-right) overlaid with a light, low-alpha geometric motif whose shape is
 * derived from `seed`. Static by design — it is a thumbnail, so it never
 * animates per frame.
 */
export class ThumbDoodle extends Entity {
  constructor(
    width: number,
    height: number,
    private readonly seed: number,
    private readonly accent: Accent,
  ) {
    super("ThumbDoodle");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const grad = r.createLinearGradient(0, 0, this.width, this.height, [
      { stop: 0, color: this.accent.a },
      { stop: 1, color: this.accent.b },
    ]);
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, PANEL_RADIUS);
    r.fill(grad);

    // The motif is drawn inside a clip so seed-driven lines never bleed past the
    // rounded panel edge; light + low alpha keeps it a texture, not a subject.
    r.save();
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, PANEL_RADIUS);
    r.clip(0, 0, this.width, this.height);

    const cx = this.width / 2;
    const cy = this.height / 2;
    const rings = 2 + (this.seed % 3);
    r.setGlobalAlpha(0.14);
    for (let i = 0; i < rings; i++) {
      const radius = MOTIF_INSET + i * (this.height / (rings * 2));
      r.beginPath();
      r.arc(cx, cy, radius, 0, Math.PI * 2);
      r.stroke("#ffffff", 1.5);
    }

    const spokes = 3 + (this.seed % 4);
    const spread = this.height / 2 - 4;
    r.setGlobalAlpha(0.1);
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 + this.seed * 0.4;
      r.beginPath();
      r.moveTo(cx, cy);
      r.lineTo(cx + Math.cos(angle) * spread, cy + Math.sin(angle) * spread);
      r.stroke("#ffffff", 1);
    }
    r.setGlobalAlpha(1);
    r.restore();
  }
}
