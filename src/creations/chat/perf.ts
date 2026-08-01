/**
 * PerfMonitor — lightweight FPS / memory / CPU snapshot.
 *
 * Memory: window.performance.memory (Chrome only, non-standard).
 * CPU:    approximated via frame-time ratio (actual frame time / the budget of
 *         one refresh interval). The budget is *measured* from the fastest rate
 *         the display has sustained, never hardcoded to 60fps/16.67ms — this
 *         panel runs on 240Hz hardware, where a hardcoded 60 reports a full
 *         frame as 0.25 and hides real stalls. A proper CPU% requires
 *         Worker+SharedArrayBuffer or the DevTools protocol; this is a proxy.
 */

export interface PerfSample {
  fps: number;
  /** Best sustained frame rate since mount (running max of the smoothed rate) */
  peakFps: number;
  /** JS heap used in MB (Chrome only, else NaN) */
  heapUsedMB: number;
  /** Heap limit in MB (Chrome only, else NaN) */
  heapLimitMB: number;
  /** Frame time in ms */
  frameMs: number;
  /**
   * CPU load proxy: frameMs / refreshMs (1.0 ≈ one whole refresh interval).
   * Not a true OS CPU%; useful for streaming benchmark pressure.
   */
  cpuProxy?: number;
  /** Measured refresh interval in ms that cpuProxy is relative to. */
  refreshMs: number;
}

const FPS_ALPHA = 0.1; // EMA smoothing

// A frame gap longer than this means the render loop was idle (onDemand
// skipped frames), not that a single frame genuinely took this long. Feeding
// such a gap into the rate estimate poisons the panel with a misleadingly bad
// reading. Idle ticks are held, not averaged in.
const IDLE_GAP_MS = 200;

// No real display refreshes faster than this; clamp so a coalesced double-rAF
// (a sub-ms `dt`) can't momentarily read as an impossible 500+fps.
const FPS_CEIL = 360;
// Track the best frame rate the display has sustained, alongside the live rate.
// FPS shows the live (smoothed) rate so genuine choppiness is visible; FPS PEAK
// shows the best sustained rate so a high-refresh panel's real capability is
// also on screen. Neither is reset on idle — the onDemand scene parks between
// renders, and reseeding those gaps to a flat 60 is what used to pin the panel.
export class PerfMonitor {
  private _fps = 60; // live smoothed rate — the reported FPS
  private _peakFps = 60; // running max of the smoothed rate — reported as PEAK
  private _last = performance.now();

  tick(now: number): PerfSample {
    const dt = now - this._last;
    this._last = now;

    if (dt > 0 && dt <= IDLE_GAP_MS) {
      // A real rendered frame. Update the live smoothed rate and the peak.
      const instantFps = Math.min(1000 / dt, FPS_CEIL);
      this._fps = this._fps * (1 - FPS_ALPHA) + instantFps * FPS_ALPHA;
      if (this._fps > this._peakFps) this._peakFps = this._fps;
    }
    // Idle ticks (dt > IDLE_GAP_MS, or a zero/negative dt) are ignored: the
    // onDemand scene parks between renders, so the gap is not a real frame.
    return this.buildSample();
  }

  private buildSample(): PerfSample {
    const mem = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    const heapUsedMB = mem ? mem.usedJSHeapSize / 1_048_576 : NaN;
    const heapLimitMB = mem ? mem.jsHeapSizeLimit / 1_048_576 : NaN;

    // FRAME is the best (minimum) frame time, derived from the same peak the FPS
    // reports, so the two fields always agree instead of the old raw single-frame
    // `dt` that randomly landed on a heavy re-layout/GC frame.
    const frameMs = Math.round((1000 / Math.max(this._fps, 1)) * 10) / 10;
    // The frame budget is one refresh interval of the panel we are actually on,
    // inferred from the best rate it has sustained. Falls back to 60Hz only
    // before the first real frame has been timed.
    const refreshMs = 1000 / Math.max(this._peakFps, 1);
    return {
      fps: Math.round(this._fps),
      peakFps: Math.round(this._peakFps),
      heapUsedMB,
      heapLimitMB,
      frameMs,
      cpuProxy: Math.round((frameMs / refreshMs) * 100) / 100,
      refreshMs,
    };
  }
}
