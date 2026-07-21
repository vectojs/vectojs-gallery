/**
 * PerfMonitor — lightweight FPS / memory / CPU snapshot.
 *
 * Memory: window.performance.memory (Chrome only, non-standard).
 * CPU:    approximated via frame-time ratio (actual frame time / 16.67 ms).
 *         A proper CPU% requires Worker+SharedArrayBuffer or the DevTools
 *         protocol — this gives a useful proxy for the benchmark.
 */

export interface PerfSample {
  fps: number;
  /** JS heap used in MB (Chrome only, else NaN) */
  heapUsedMB: number;
  /** Heap limit in MB (Chrome only, else NaN) */
  heapLimitMB: number;
  /** Frame time in ms */
  frameMs: number;
  /**
   * CPU load proxy: frameMs / 16.67 (1.0 ≈ full 60 fps budget).
   * Not a true OS CPU%; useful for streaming benchmark pressure.
   */
  cpuProxy?: number;
}

const FPS_ALPHA = 0.1; // EMA smoothing

// A frame gap longer than this means the render loop was idle (onDemand
// skipped frames), not that a single frame genuinely took this long. Blending
// such a gap into the FPS EMA (or reporting it as `frameMs`) poisons the panel
// with a misleadingly bad reading that then stays frozen once the scene
// settles — the exact "stuck at 14 fps / 900ms after the document finished"
// artifact users saw. Treat a gap past this threshold as an idle resumption:
// reseed the average from the real instantaneous rate instead of averaging in
// the idle gap.
const IDLE_GAP_MS = 200;

export class PerfMonitor {
  private _fps = 60;
  private _last = performance.now();

  tick(now: number): PerfSample {
    const dt = now - this._last;
    this._last = now;

    const instantFps = dt > 0 ? 1000 / dt : 60;
    if (dt > IDLE_GAP_MS) {
      // Resuming after idle (the render loop parked, so `dt` is the whole idle
      // gap, not a real frame). Reporting that gap as a frame is exactly the
      // misleading "stuck at ~900ms / low fps" reading that then FREEZES on
      // screen once the scene settles. Show a neutral placeholder instead —
      // real frames (dt < IDLE_GAP_MS) immediately correct the EMA from here.
      this._fps = 60;
      return this.buildSample(1000 / 60);
    }
    this._fps = this._fps * (1 - FPS_ALPHA) + instantFps * FPS_ALPHA;
    return this.buildSample(dt);
  }

  private buildSample(_frameTimeMs: number): PerfSample {
    const mem = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    const heapUsedMB = mem ? mem.usedJSHeapSize / 1_048_576 : NaN;
    const heapLimitMB = mem ? mem.jsHeapSizeLimit / 1_048_576 : NaN;

    // Derive the displayed frame time from the smoothed FPS rather than the raw
    // single-frame `dt`. The panel only samples once per second (see
    // ChatCreation.update), so a raw single-frame value randomly lands on a heavy
    // re-layout/GC frame and reads as an alarming ~60ms while FPS shows a healthy
    // 60 — an inconsistent, misleading pair. Both fields now come from the same
    // EMA, so FRAME and FPS always agree and freeze on a coherent value once the
    // onDemand scene goes idle.
    const frameMs = Math.round((1000 / Math.max(this._fps, 1)) * 10) / 10;
    return {
      fps: Math.round(this._fps),
      heapUsedMB,
      heapLimitMB,
      frameMs,
      cpuProxy: Math.round((frameMs / 16.67) * 100) / 100,
    };
  }
}
