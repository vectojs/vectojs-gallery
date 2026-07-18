/**
 * DropZone — full-screen file drop area shown when no file is loaded.
 *
 * Renders a centered card with drag-and-drop instructions and a click-to-open
 * button. Hidden once a file is loaded.
 */

import { Entity } from "@vectojs/core";
import { isInsideBox } from "./hitTest";
import type { RawRenderer } from "./raw-renderer";

export class DropZone extends Entity {
  private _visible = true;
  /** Show/hide the drop zone and its interactivity in one step. */
  get visible(): boolean {
    return this._visible;
  }
  set visible(v: boolean) {
    this._visible = v;
    this.interactive = v;
    this.opacity = v ? 1 : 0;
  }
  private _hovered = false;
  private _onClick: () => void;
  private _time = 0;

  constructor(onClick: () => void) {
    super("DropZone");
    this._onClick = onClick;
    this.interactive = true;

    this.on("click", () => this._onClick());
    this.on("hover", () => {
      this._hovered = true;
    });
    this.on("pointerleave", () => {
      this._hovered = false;
    });
  }

  isPointInside(globalX: number, globalY: number): boolean {
    if (!this._visible) return false;
    return isInsideBox(this, globalX, globalY);
  }

  update(dt: number): void {
    this._time += dt;
  }

  render(renderer: RawRenderer): void {
    if (!this._visible) return;

    const ctx = renderer.ctx;
    const w = this.width;
    const h = this.height;

    // Warm parchment background
    ctx.fillStyle = "#f7f2e8";
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center card
    const cw = Math.min(520, w - 80);
    const ch = 300;
    const cx = (w - cw) / 2;
    const cy = (h - ch) / 2;

    const pulse = 1 + Math.sin(this._time * 0.002) * 0.015;
    ctx.save();
    ctx.translate(cx + cw / 2, cy + ch / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(cw / 2), -(ch / 2));

    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, 16);
    ctx.fillStyle = this._hovered
      ? "rgba(255,255,255,0.9)"
      : "rgba(255,255,255,0.75)";
    ctx.fill();
    ctx.strokeStyle = this._hovered
      ? "rgba(180,130,60,0.5)"
      : "rgba(0,0,0,0.08)";
    ctx.lineWidth = this._hovered ? 1.5 : 1;
    ctx.stroke();

    // Icon
    const iconAnim = 4 * Math.sin(this._time * 0.003);
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📄", cw / 2, 72 + iconAnim);

    // Title
    ctx.font = "900 24px sans-serif";
    ctx.fillStyle = "#3d2e1a";
    ctx.fillText("Drop a file to stream", cw / 2, 140);

    // Sub
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#8c7a65";
    ctx.fillText("TXT · Markdown · EPUB · any text file", cw / 2, 172);

    // Button
    const bw = 180,
      bh = 40;
    const bx = (cw - bw) / 2,
      by = 210;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 20);
    ctx.fillStyle = this._hovered
      ? "rgba(180,130,60,0.2)"
      : "rgba(180,130,60,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(180,130,60,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#9a6d30";
    ctx.fillText("Click to open file", cw / 2, by + bh / 2);

    ctx.restore();

    // Hint
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(120,100,75,0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      "Supports drag & drop · EPUB chapters extracted automatically",
      w / 2,
      h - 20,
    );
  }

  hasPendingAnimations(): boolean {
    return this._visible;
  }
}
