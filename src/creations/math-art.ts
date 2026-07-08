import { Entity, type IRenderer } from "@vectojs/core";

export default class MathArt extends Entity {
  private time = 0;

  constructor() {
    super("MathArt");
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.time = time * 0.001; // convert to seconds
  }

  override render(r: IRenderer): void {
    // Draw background
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("#0b0f19");

    // Centered coordinates
    const cx = this.width / 2;
    const cy = this.height / 2;

    r.save();
    r.translate(cx, cy);

    const count = 180;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    for (let i = 0; i < count; i++) {
      const angle = i * 0.15 + this.time * 0.5;
      const radius = (i / count) * maxRadius;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const size = 3 + (i / count) * 8;
      const hue = (i * 2 + this.time * 50) % 360;
      const color = `hsla(${hue}, 80%, 65%, 0.75)`;

      r.beginPath();
      r.arc(x, y, size, 0, Math.PI * 2);
      r.fill(color);

      if (i > 0) {
        const prevAngle = (i - 1) * 0.15 + this.time * 0.5;
        const prevRadius = ((i - 1) / count) * maxRadius;
        const px = Math.cos(prevAngle) * prevRadius;
        const py = Math.sin(prevAngle) * prevRadius;

        r.beginPath();
        r.moveTo(px, py);
        r.lineTo(x, y);
        r.stroke(`hsla(${hue}, 60%, 50%, 0.15)`, 1);
      }
    }

    r.restore();
  }
}
