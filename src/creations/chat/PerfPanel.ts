/**
 * PerfPanel — overlaid stats panel (top-right corner).
 * Shows: FPS | Frame ms | JS Heap | CPU proxy
 * Drawn directly on Canvas2D for minimal overhead.
 */

import { Entity } from '@vectojs/core';
import type { PerfSample } from './perf';
import type { RawRenderer } from './raw-renderer';

export class PerfPanel extends Entity {
  public sample: PerfSample = {
    fps: 0,
    peakFps: 0,
    heapUsedMB: 0,
    heapLimitMB: 0,
    frameMs: 0,
    refreshMs: 1000 / 60,
  };

  constructor() {
    super('PerfPanel');
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
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const row = (label: string, value: string, y: number, color = '#5c4a35') => {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9e8e78';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 12, y);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = color;
      ctx.fillText(value, w - 12 - ctx.measureText(value).width, y);
    };

    // Health is judged against the panel's own measured rate, not a hardcoded
    // 60: on a 240Hz display a steady 200fps is healthy, and on a 60Hz one it is
    // unreachable. Green >=90% of peak, amber >=50%, red below.
    const target = Math.max(s.peakFps, 1);
    const ratio = s.fps / target;
    const fpsColor = ratio >= 0.9 ? '#22c55e' : ratio >= 0.5 ? '#f59e0b' : '#ef4444';

    // Live rate (colored by health) plus the best sustained rate ("peak"), so a
    // high-refresh panel's capability is visible without hiding real choppiness.
    row('FPS', `${s.fps}  ·  ${s.peakFps} pk`, 22, fpsColor);
    row('FRAME', `${s.frameMs} ms`, 42);
    row('HEAP', isNaN(s.heapUsedMB) ? 'N/A' : `${s.heapUsedMB.toFixed(1)} MB`, 62);
    row('HEAP LIM', isNaN(s.heapLimitMB) ? 'N/A' : `${s.heapLimitMB.toFixed(0)} MB`, 80);
  }
}
