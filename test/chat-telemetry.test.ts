import { describe, expect, test } from 'bun:test';
import { PerfMonitor, RefreshRateProbe } from '../src/creations/chat/perf';
import { fpsHealthColor, formatHeap, formatMs, formatRate } from '../src/creations/chat/PerfPanel';

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
    const neutral = fpsHealthColor(NaN, 240);
    expect(fpsHealthColor(120, NaN)).toBe(neutral);
    expect(fpsHealthColor(120, 0)).toBe(neutral);
  });

  test('a high rate on a faster display is not scored as healthy', () => {
    // 120fps is excellent against 60Hz and mediocre against 240Hz. Scoring
    // against a hardcoded 60 would call both cases green.
    const on60 = fpsHealthColor(120, 60);
    const on240 = fpsHealthColor(120, 240);
    expect(on60).not.toBe(on240);
  });

  test('grades by ratio, not by absolute rate', () => {
    // Same ratio at two very different absolute rates must grade identically.
    expect(fpsHealthColor(58, 60)).toBe(fpsHealthColor(232, 240));
    expect(fpsHealthColor(40, 60)).toBe(fpsHealthColor(160, 240));
    expect(fpsHealthColor(12, 60)).toBe(fpsHealthColor(48, 240));
  });

  test('the three bands are distinct', () => {
    const good = fpsHealthColor(240, 240);
    const warn = fpsHealthColor(150, 240);
    const bad = fpsHealthColor(30, 240);
    expect(new Set([good, warn, bad]).size).toBe(3);
  });
});
