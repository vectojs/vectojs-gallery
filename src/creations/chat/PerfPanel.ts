/**
 * PerfPanel — overlaid stats panel (top-right corner).
 *
 * Shows: rendered FPS + measured display Hz | render cost | JS heap.
 * Drawn directly on Canvas2D for minimal overhead.
 *
 * Every field renders `—` when its input has not been measured yet, rather than
 * a stand-in number. A placeholder integer here is indistinguishable on screen
 * from a real reading, which is exactly how this panel previously came to
 * display a hardcoded 60 as though it had measured it.
 */

import { Entity } from '@vectojs/core';
import type { PerfSample } from './perf';
import type { RawRenderer } from './raw-renderer';

/** Health thresholds for the rendered-vs-display rate ratio. */
const RATIO_GOOD = 0.9;
const RATIO_WARN = 0.5;

const COLOR_GOOD = '#22c55e';
const COLOR_WARN = '#f59e0b';
const COLOR_BAD = '#ef4444';
const COLOR_UNKNOWN = '#5c4a35';

export class PerfPanel extends Entity {
  /**
   * Starts fully unmeasured — every field `NaN`, rendered as `—`.
   *
   * Seeding these with numbers is what made the panel assert 60fps before it had
   * timed a single frame.
   */
  public sample: PerfSample = {
    fps: NaN,
    displayHz: NaN,
    frameMs: NaN,
    frameIntervalMs: NaN,
    heapUsedMB: NaN,
    heapLimitMB: NaN,
    cpuProxy: NaN,
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

    const row = (label: string, value: string, y: number, color = COLOR_UNKNOWN) => {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9e8e78';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 12, y);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = color;
      ctx.fillText(value, w - 12 - ctx.measureText(value).width, y);
    };

    // Health is the rendered cadence against the *measured* display rate. Both
    // must be known for the comparison to mean anything; with either missing the
    // value is drawn neutral rather than being scored against a guess.
    const fpsColor = fpsHealthColor(s.fps, s.displayHz);

    row('FPS', formatRate(s.fps), 22, fpsColor);
    row('DISPLAY', formatRate(s.displayHz), 42);
    row('RENDER', formatMs(s.frameMs), 62);
    row('HEAP', formatHeap(s.heapUsedMB), 80);
  }
}

/**
 * Colors the rendered rate against the measured display rate.
 *
 * Returns the neutral color unless both are known: an `onDemand` scene parked
 * between renders legitimately reports a fraction of the display rate, so this
 * only scores the ratio when there is a real rate to score against.
 */
export function fpsHealthColor(fps: number, displayHz: number): string {
  if (!Number.isFinite(fps) || !Number.isFinite(displayHz) || displayHz <= 0) {
    return COLOR_UNKNOWN;
  }
  const ratio = fps / displayHz;
  if (ratio >= RATIO_GOOD) return COLOR_GOOD;
  if (ratio >= RATIO_WARN) return COLOR_WARN;
  return COLOR_BAD;
}

/** Formats a rate in Hz, or `—` when unmeasured. */
export function formatRate(hz: number): string {
  return Number.isFinite(hz) ? `${Math.round(hz)} Hz` : '—';
}

/** Formats a duration in ms, or `—` when unmeasured. */
export function formatMs(ms: number): string {
  return Number.isFinite(ms) ? `${ms} ms` : '—';
}

/** Formats a heap reading in MB, or `N/A` where the API is unavailable. */
export function formatHeap(mb: number): string {
  return Number.isFinite(mb) ? `${mb.toFixed(1)} MB` : 'N/A';
}
