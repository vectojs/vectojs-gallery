import { describe, expect, test } from 'bun:test';
import { PerfMonitor, RefreshRateProbe } from '../src/creations/chat/perf';
import {
  formatDisplayRate,
  formatHeap,
  formatMs,
  formatRate,
  fpsHealthColor,
  starvationColor,
} from '../src/creations/chat/PerfPanel';

/**
 * A `Scene`-shaped stub exposing only `frameStats`, which is all `PerfMonitor`
 * reads. Typed through `never` at the call site rather than by widening the
 * production signature — the monitor should keep demanding a real `Scene`.
 */
function sceneWith(stats: { fps?: number; frameTimeMs?: number; frameIntervalMs?: number }): never {
  return {
    frameStats: {
      fps: stats.fps ?? 0,
      frameTimeMs: stats.frameTimeMs ?? 0,
      frameIntervalMs: stats.frameIntervalMs ?? 0,
      dt: 0,
      renderedFrames: 0,
      skippedFrames: 0,
      renderMode: 'onDemand' as const,
      dirty: false,
    },
  } as never;
}

describe('PerfMonitor reads engine telemetry rather than re-deriving it', () => {
  test('reports NaN, not a placeholder rate, before the engine has timed a frame', () => {
    const monitor = new PerfMonitor();
    monitor.destroy();
    const s = monitor.sample(sceneWith({}));

    // The whole point of the rewrite: an unmeasured field must not surface as a
    // number. A seeded 60 here is indistinguishable on screen from a reading.
    expect(Number.isNaN(s.fps)).toBe(true);
    expect(Number.isNaN(s.frameMs)).toBe(true);
    expect(Number.isNaN(s.frameIntervalMs)).toBe(true);
  });

  test('passes through the measured rate and render cost', () => {
    const monitor = new PerfMonitor();
    monitor.destroy();
    const s = monitor.sample(sceneWith({ fps: 237.4, frameTimeMs: 2.06, frameIntervalMs: 4.21 }));

    expect(s.fps).toBe(237.4);
    expect(s.frameMs).toBe(2.1);
    expect(s.frameIntervalMs).toBe(4.2);
  });

  test('render cost is independent of the reported rate', () => {
    const monitor = new PerfMonitor();
    monitor.destroy();
    const s = monitor.sample(sceneWith({ fps: 4, frameTimeMs: 1.5 }));

    // A parked onDemand scene renders rarely but each render is still cheap.
    // Deriving frameMs as 1000/fps would claim 250ms here, turning correct
    // idle behaviour into an apparent quarter-second stall.
    expect(s.frameMs).toBe(1.5);
    expect(s.frameMs).not.toBeCloseTo(1000 / 4, 1);
  });

  test('cpuProxy stays NaN while the display rate is unknown', () => {
    const monitor = new PerfMonitor();
    monitor.destroy();
    const s = monitor.sample(sceneWith({ frameTimeMs: 4 }));

    // Without a measured refresh rate there is no budget to divide by, and the
    // old code's fallback was exactly the hardcoded 60 this removes.
    expect(Number.isNaN(s.cpuProxy)).toBe(true);
  });
});

describe('RefreshRateProbe', () => {
  test('reports NaN until calibration completes', () => {
    const probe = new RefreshRateProbe();
    expect(Number.isNaN(probe.hz)).toBe(true);
    probe.stop();
  });

  test('measures the rAF cadence from counted ticks', async () => {
    // A fake rAF advancing exactly 4ms per tick — a 250Hz display. Verifies the
    // probe divides by observed intervals, not by frame count: 60 frames across
    // 60 gaps of 4ms is 250Hz, while counting the origin frame as a gap would
    // report 254.2.
    const realRaf = globalThis.requestAnimationFrame;
    let clock = 1000;
    const pending: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      pending.push(cb);
      return pending.length;
    }) as typeof globalThis.requestAnimationFrame;

    try {
      const probe = new RefreshRateProbe();
      probe.start();
      // Drain: the probe re-arms one callback per tick.
      for (let i = 0; i < 200 && pending.length > 0; i++) {
        const cb = pending.shift()!;
        cb(clock);
        clock += 4;
      }
      expect(probe.hz).toBeCloseTo(250, 0);
    } finally {
      globalThis.requestAnimationFrame = realRaf;
    }
  });

  test('stop() before completion leaves the rate unmeasured', () => {
    const realRaf = globalThis.requestAnimationFrame;
    const pending: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      pending.push(cb);
      return pending.length;
    }) as typeof globalThis.requestAnimationFrame;

    try {
      const probe = new RefreshRateProbe();
      probe.start();
      pending.shift()?.(1000);
      probe.stop();
      // Draining further must not resume a stopped probe.
      let clock = 1004;
      for (let i = 0; i < 100 && pending.length > 0; i++) {
        pending.shift()!(clock);
        clock += 4;
      }
      expect(Number.isNaN(probe.hz)).toBe(true);
    } finally {
      globalThis.requestAnimationFrame = realRaf;
    }
  });
});

describe('RefreshRateProbe keeps measuring instead of latching one reading', () => {
  /** Drives a fake rAF whose per-tick advance can change mid-run. */
  function driveProbe(msPerTickByPhase: number[][]): RefreshRateProbe {
    const realRaf = globalThis.requestAnimationFrame;
    const pending: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      pending.push(cb);
      return pending.length;
    }) as typeof globalThis.requestAnimationFrame;
    const probe = new RefreshRateProbe();
    try {
      probe.start();
      let clock = 1000;
      for (const [ticks, msPerTick] of msPerTickByPhase) {
        for (let i = 0; i < ticks && pending.length > 0; i++) {
          pending.shift()!(clock);
          clock += msPerTick;
        }
      }
    } finally {
      globalThis.requestAnimationFrame = realRaf;
    }
    probe.stop();
    return probe;
  }

  test('opens a new window instead of stopping after the first', () => {
    // The defect: calibration ran once from the constructor, latched, and set
    // running = false. A second window must still produce a reading, or DISPLAY is
    // forever whatever the first ~60 frames happened to see.
    const probe = driveProbe([[122, 4]]);
    expect(probe.hz).toBeCloseTo(250, 0);
    expect(probe.currentHz).toBeCloseTo(250, 0);
  });

  test('a slow first window is corrected by a later fast one', () => {
    // This is the reported bug. Calibrating while the document is busy latched
    // DISPLAY at the starved rate for the whole session: measured 8.3 Hz under a
    // ~120 ms/frame block versus 240.2 Hz idle, with focus untouched throughout.
    // window 1 at 120ms/tick ≈ 8.3Hz, then window 2 at 4ms/tick ≈ 250Hz.
    const probe = driveProbe([
      [61, 120],
      [61, 4],
    ]);
    expect(probe.hz).toBeCloseTo(250, 0);
  });

  test('keeps the maximum, so a later slow window cannot pull capability down', () => {
    // rAF cannot exceed vsync, so contention only ever depresses a window. The
    // max is therefore the correct estimator of what the display can do, and it
    // must not be dragged back down when the app gets busy again.
    const probe = driveProbe([
      [61, 4],
      [61, 120],
    ]);
    expect(probe.hz).toBeCloseTo(250, 0);
    // …while the live cadence does follow the slowdown, which is the whole point
    // of reporting two numbers.
    expect(probe.currentHz).toBeLessThan(20);
  });

  test('currentHz tracks the latest window, not the best one', () => {
    const probe = driveProbe([
      [61, 4],
      [61, 20],
    ]);
    expect(probe.hz).toBeCloseTo(250, 0);
    expect(probe.currentHz).toBeCloseTo(50, 0);
  });
});

describe('the display row shows starvation rather than hiding it', () => {
  test('shows the bare capability while the page keeps up', () => {
    expect(formatDisplayRate(240, 238)).toBe('240 Hz');
    expect(formatDisplayRate(240, 240)).toBe('240 Hz');
  });

  test('annotates the live cadence once it falls behind', () => {
    // A starved session must not read as a healthy one.
    expect(formatDisplayRate(240, 8)).toBe('240←8');
    expect(formatDisplayRate(240, 60)).toBe('240←60');
  });

  test('stays an em dash until the capability is measured', () => {
    expect(formatDisplayRate(NaN, 8)).toBe('—');
  });

  test('shows the bare capability when the live cadence is unknown', () => {
    expect(formatDisplayRate(240, NaN)).toBe('240 Hz');
  });

  test('colors neutral when keeping up and warm when starved', () => {
    const keeping = starvationColor({ displayHz: 240, rafHz: 238 });
    const starved = starvationColor({ displayHz: 240, rafHz: 8 });
    expect(keeping).not.toBe(starved);
    // Unknown inputs must not be scored as starvation.
    expect(starvationColor({ displayHz: NaN, rafHz: 8 })).toBe(keeping);
    expect(starvationColor({ displayHz: 240, rafHz: NaN })).toBe(keeping);
  });
});

describe('panel formatting never fabricates a reading', () => {
  test('renders an em dash for unmeasured values', () => {
    expect(formatRate(NaN)).toBe('—');
    expect(formatMs(NaN)).toBe('—');
    expect(formatHeap(NaN)).toBe('N/A');
  });

  test('renders measured values with units', () => {
    expect(formatRate(239.6)).toBe('240 Hz');
    expect(formatMs(2.1)).toBe('2.1 ms');
    expect(formatHeap(48.25)).toBe('48.3 MB');
  });
});

describe('fps health is scored against the measured display rate', () => {
  test('is neutral when either rate is unknown', () => {
    const neutral = fpsHealthColor(NaN, 240, 'always');
    expect(fpsHealthColor(120, NaN, 'always')).toBe(neutral);
    expect(fpsHealthColor(120, 0, 'always')).toBe(neutral);
  });

  test('is neutral on a parked onDemand scene even at a low rate', () => {
    // 4 Hz against 240 Hz is ratio 0.017 — under always-mode that is COLOR_BAD.
    // onDemand idle is correct behaviour; paint it neutral, not red or green.
    const neutral = fpsHealthColor(NaN, 240, 'always');
    expect(fpsHealthColor(4, 240, 'onDemand')).toBe(neutral);
    expect(fpsHealthColor(4, 240, 'always')).not.toBe(neutral);
  });

  test('a high rate on a faster display is not scored as healthy', () => {
    // 120fps is excellent against 60Hz and mediocre against 240Hz. Scoring
    // against a hardcoded 60 would call both cases green.
    const on60 = fpsHealthColor(120, 60, 'always');
    const on240 = fpsHealthColor(120, 240, 'always');
    expect(on60).not.toBe(on240);
  });

  test('grades by ratio, not by absolute rate', () => {
    // Same ratio at two very different absolute rates must grade identically.
    expect(fpsHealthColor(58, 60, 'always')).toBe(fpsHealthColor(232, 240, 'always'));
    expect(fpsHealthColor(40, 60, 'always')).toBe(fpsHealthColor(160, 240, 'always'));
    expect(fpsHealthColor(12, 60, 'always')).toBe(fpsHealthColor(48, 240, 'always'));
  });

  test('the three bands are distinct', () => {
    const good = fpsHealthColor(240, 240, 'always');
    const warn = fpsHealthColor(150, 240, 'always');
    const bad = fpsHealthColor(30, 240, 'always');
    expect(new Set([good, warn, bad]).size).toBe(3);
  });
});
