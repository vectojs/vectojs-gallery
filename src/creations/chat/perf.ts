/**
 * PerfMonitor — frame / memory telemetry for the streaming benchmark panel.
 *
 * Every rate and cost here is **read from the engine**, not re-derived. Core
 * already measures the same quantities on the render loop it owns
 * (`Scene.frameStats`), so a second estimate maintained out here can only drift
 * from the thing it is trying to report — and it did: this module used to keep
 * its own EMA over `1000 / dt` sampled from `update()`, seeded at a literal 60.
 *
 * Two consequences of that seed, both of which showed on screen:
 *
 * - An `onDemand` scene parks between renders. Every idle gap exceeded the
 *   module's own idle threshold and was discarded, so a panel opened but never
 *   streamed reported the seed verbatim — a hardcoded `60` presented as a
 *   measurement, on a display that may run at any rate.
 * - The peak was a running max that never decayed, so a single coalesced
 *   sub-millisecond frame ratcheted it permanently and dragged the derived
 *   refresh interval and CPU proxy with it.
 *
 * What is measured where:
 *
 * - `fps` / `frameMs` / `frameIntervalMs` come from {@link FrameStats}. `fps` is
 *   the cadence of *rendered* frames and `frameTimeMs` is the wall-clock cost of
 *   the last `render()` pass, so neither is a reciprocal of the other and a
 *   cheap frame on a parked scene no longer reads as a fast one.
 * - `displayHz` is calibrated separately by counting raw `requestAnimationFrame`
 *   ticks, because no engine field can carry it: `frameStats.fps` reports redraw
 *   cadence, and an `onDemand` scene deliberately redraws less often than the
 *   display refreshes. Reporting the panel's real capability needs the rAF rate
 *   itself.
 *
 * Memory is `performance.memory` (Chrome only, non-standard); absent elsewhere
 * and reported as `NaN` rather than a fabricated number.
 */

import type { Scene } from '@vectojs/core';

export interface PerfSample {
  /**
   * Rendered-frame cadence in Hz, or `NaN` before the engine has timed a pair
   * of frames.
   *
   * `NaN` rather than a placeholder integer: the panel renders it as `—`, which
   * is honest about having nothing to report yet. Any stand-in number here is
   * indistinguishable on screen from a real reading.
   */
  fps: number;
  /**
   * Measured display refresh rate in Hz from the rAF calibration, or `NaN`
   * until it completes.
   *
   * Reported alongside `fps` because on an `onDemand` scene the two legitimately
   * differ — a parked scene rendering 4 times a second on a 240Hz panel is
   * correct behaviour, not a stall, and only showing both makes that legible.
   */
  displayHz: number;
  /** Wall-clock cost of the last render pass in ms, or `NaN` before the first. */
  frameMs: number;
  /** Smoothed interval between rendered frames in ms, or `NaN` before the first. */
  frameIntervalMs: number;
  /** JS heap used in MB (Chrome only, else `NaN`). */
  heapUsedMB: number;
  /** Heap limit in MB (Chrome only, else `NaN`). */
  heapLimitMB: number;
  /**
   * Render cost as a fraction of one display refresh interval (`1.0` ≈ a whole
   * interval spent rendering), or `NaN` until both inputs are known.
   *
   * Measured against the calibrated display rate, never a hardcoded 60: on a
   * 240Hz panel a 4ms frame is 96% of the budget, while against an assumed 60Hz
   * it would read as a comfortable 24% and hide the stall. Not an OS CPU
   * percentage — a real one needs `Worker` + `SharedArrayBuffer` or the DevTools
   * protocol.
   */
  cpuProxy: number;
}

/**
 * rAF ticks to count before reporting a display rate.
 *
 * Enough to average out compositor jitter without making the field stay blank
 * long enough to look broken; at 60Hz this settles in about a second, faster on
 * a high-refresh panel.
 */
const CALIBRATION_FRAMES = 60;

/**
 * Counts raw `requestAnimationFrame` ticks to establish the display's refresh
 * rate.
 *
 * Deliberately independent of the scene's loop. The engine throttles and skips
 * redraws by design, so measuring redraws cannot recover the panel's rate; this
 * runs its own chain of rAF callbacks and stops as soon as it has enough.
 */
export class RefreshRateProbe {
  private frames = 0;
  private startTime = 0;
  private _hz = NaN;
  private rafId = 0;
  private running = false;

  /** Measured refresh rate in Hz, or `NaN` until calibration completes. */
  get hz(): number {
    return this._hz;
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    this.frames = 0;
    this.startTime = 0;
    const tick = (now: number): void => {
      if (!this.running) return;
      if (this.startTime === 0) {
        // The first callback only establishes the origin — no interval has been
        // observed yet, so counting it would divide by one fewer gap than the
        // frames imply and over-report the rate.
        this.startTime = now;
      } else {
        this.frames++;
        if (this.frames >= CALIBRATION_FRAMES) {
          const elapsed = now - this.startTime;
          if (elapsed > 0) this._hz = (this.frames * 1000) / elapsed;
          this.running = false;
          return;
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stops an in-flight calibration; keeps any rate already measured. */
  stop(): void {
    this.running = false;
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = 0;
  }
}

/** Rounds to one decimal place for display. */
function round1(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : NaN;
}

export class PerfMonitor {
  private probe = new RefreshRateProbe();

  constructor() {
    this.probe.start();
  }

  /** Stops the refresh-rate calibration. Safe to call more than once. */
  destroy(): void {
    this.probe.stop();
  }

  /**
   * Builds a sample from the scene's own telemetry.
   *
   * Takes the `Scene` rather than a timestamp because there is nothing left to
   * time out here — the engine has already measured it on the loop that did the
   * work.
   */
  sample(scene: Scene): PerfSample {
    const stats = scene.frameStats;
    const mem = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;

    // `frameStats` reports 0 for "not yet measured" on all three of these.
    // Passing that through would show a real 0 fps / 0 ms frame, so it is
    // mapped to NaN and rendered as `—`.
    const fps = stats.fps > 0 ? stats.fps : NaN;
    const frameMs = stats.frameTimeMs > 0 ? stats.frameTimeMs : NaN;
    const frameIntervalMs = stats.frameIntervalMs > 0 ? stats.frameIntervalMs : NaN;

    const displayHz = this.probe.hz;
    const cpuProxy =
      Number.isFinite(frameMs) && Number.isFinite(displayHz) && displayHz > 0
        ? frameMs / (1000 / displayHz)
        : NaN;

    return {
      fps: round1(fps),
      displayHz: round1(displayHz),
      frameMs: round1(frameMs),
      frameIntervalMs: round1(frameIntervalMs),
      heapUsedMB: mem ? mem.usedJSHeapSize / 1_048_576 : NaN,
      heapLimitMB: mem ? mem.jsHeapSizeLimit / 1_048_576 : NaN,
      cpuProxy: Number.isFinite(cpuProxy) ? Math.round(cpuProxy * 100) / 100 : NaN,
    };
  }
}
