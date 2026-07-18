/**
 * PerfPanel — overlaid stats panel (top-right corner).
 * Shows: FPS | Frame ms | JS Heap | CPU proxy
 * Drawn directly on Canvas2D for minimal overhead.
 */

import { Entity } from "@vectojs/core";
import type { PerfSample } from "./perf";
import type { RawRenderer } from "./raw-renderer";

export class PerfPanel extends Entity {
  public sample: PerfSample = {
    fps: 0,
    heapUsedMB: 0,
    heapLimitMB: 0,
    frameMs: 0,
  };

  constructor() {
    super("PerfPanel");
    this.width = 180;
    this.height = 92;
    this.interactive = false;
  }

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  render(renderer: RawRenderer): void {
    const ctx = renderer.ctx;
    const w = this.width;
    const h = this.height;
    const s = this.sample;

    // Light card
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const row = (
      label: string,
      value: string,
      y: number,
      color = "#5c4a35",
    ) => {
      ctx.font = "10px monospace";
      ctx.fillStyle = "#9e8e78";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 12, y);
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = color;
      ctx.fillText(value, w - 12 - ctx.measureText(value).width, y);
    };

    const fpsColor =
      s.fps >= 55 ? "#22c55e" : s.fps >= 30 ? "#f59e0b" : "#ef4444";

    row("FPS", `${s.fps}`, 22, fpsColor);
    row("FRAME", `${s.frameMs} ms`, 42);
    row(
      "HEAP",
      isNaN(s.heapUsedMB) ? "N/A" : `${s.heapUsedMB.toFixed(1)} MB`,
      62,
    );
    row(
      "HEAP LIM",
      isNaN(s.heapLimitMB) ? "N/A" : `${s.heapLimitMB.toFixed(0)} MB`,
      80,
    );
  }
}
