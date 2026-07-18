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

export class PerfMonitor {
  private _fps = 60;
  private _last = performance.now();

  tick(now: number): PerfSample {
    const dt = now - this._last;
    this._last = now;

    const instantFps = dt > 0 ? 1000 / dt : 60;
    this._fps = this._fps * (1 - FPS_ALPHA) + instantFps * FPS_ALPHA;

    const mem = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    const heapUsedMB = mem ? mem.usedJSHeapSize / 1_048_576 : NaN;
    const heapLimitMB = mem ? mem.jsHeapSizeLimit / 1_048_576 : NaN;

    const frameMs = Math.round(dt * 10) / 10;
    return {
      fps: Math.round(this._fps),
      heapUsedMB,
      heapLimitMB,
      frameMs,
      cpuProxy: Math.round((frameMs / 16.67) * 100) / 100,
    };
  }
}
