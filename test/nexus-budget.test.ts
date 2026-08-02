import { describe, expect, test } from 'bun:test';
import {
  BUDGET,
  clampCountToPath,
  simPathFrom,
  simPathLabel,
  type SimPath,
} from '../src/creations/nexus/budget';
import { SHELL_MAX_FPS } from '../src/shell-config';

const PATHS: SimPath[] = ['webgpu', 'wasm', 'js'];

describe('simPathFrom', () => {
  test('recognizes the two accelerated paths', () => {
    expect(simPathFrom('webgpu')).toBe('webgpu');
    expect(simPathFrom('wasm')).toBe('wasm');
  });

  test('every other engine spelling collapses to js', () => {
    // `AcceleratorStatus.path` is an open `string` and the engine reports
    // several CPU spellings; all of them mean "the main thread did the work".
    for (const p of ['js', 'rejected', 'unavailable', '', 'cpu', 'WEBGPU']) {
      expect(simPathFrom(p)).toBe('js');
    }
  });
});

describe('BUDGET', () => {
  test('every path is internally consistent', () => {
    for (const path of PATHS) {
      const b = BUDGET[path];
      expect(b.min).toBeGreaterThan(0);
      expect(b.max).toBeGreaterThanOrEqual(b.min);
      expect(b.initial).toBeGreaterThanOrEqual(b.min);
      expect(b.initial).toBeLessThanOrEqual(b.max);
      expect(b.step).toBeGreaterThan(0);
      expect(b.step).toBeLessThanOrEqual(b.max - b.min);
    }
  });

  test('a CPU path is budgeted far below the GPU path', () => {
    // This is the whole point of the split: the old code sized the field from
    // `navigator.gpu` presence, so a machine that reported a GPU but fell back
    // to the CPU ran a GPU-scale count on the main thread.
    expect(BUDGET.js.max).toBeLessThan(BUDGET.webgpu.max);
    expect(BUDGET.wasm.max).toBeLessThan(BUDGET.webgpu.max);
    expect(BUDGET.js.initial).toBeLessThan(BUDGET.webgpu.initial);
    // An order of magnitude, not a token trim.
    expect(BUDGET.webgpu.max / BUDGET.js.max).toBeGreaterThanOrEqual(10);
  });

  test('WASM is budgeted above plain JS but still nowhere near GPU', () => {
    // It removes the JS integration cost, not the Canvas2D draw cost.
    expect(BUDGET.wasm.max).toBeGreaterThan(BUDGET.js.max);
    expect(BUDGET.wasm.max).toBeLessThan(BUDGET.webgpu.max / 2);
  });
});

describe('clampCountToPath', () => {
  test('clamps a GPU-scale count down when the CPU path is running', () => {
    expect(clampCountToPath(BUDGET.webgpu.initial, 'js')).toBe(BUDGET.js.max);
    expect(clampCountToPath(120_000, 'wasm')).toBe(BUDGET.wasm.max);
  });

  test('leaves a count already inside the budget untouched', () => {
    expect(clampCountToPath(2_000, 'js')).toBe(2_000);
    expect(clampCountToPath(60_000, 'webgpu')).toBe(60_000);
  });

  test('raises a count that is below the floor', () => {
    expect(clampCountToPath(10, 'js')).toBe(BUDGET.js.min);
  });

  test('never raises a within-budget count when a faster path appears', () => {
    // A user who stepped down on the GPU path keeps their choice rather than
    // being jumped back to the GPU default. Picked above the webgpu floor,
    // since a below-floor count is legitimately raised to it (tested above).
    const chosen = BUDGET.webgpu.min + BUDGET.webgpu.step;
    expect(chosen).toBeLessThan(BUDGET.webgpu.initial);
    expect(clampCountToPath(chosen, 'webgpu')).toBe(chosen);
  });

  test('is idempotent', () => {
    for (const path of PATHS) {
      for (const n of [0, 1_000, 60_000, 500_000]) {
        const once = clampCountToPath(n, path);
        expect(clampCountToPath(once, path)).toBe(once);
      }
    }
  });
});

describe('simPathLabel', () => {
  test('names each path distinctly and non-empty', () => {
    const labels = PATHS.map(simPathLabel);
    expect(new Set(labels).size).toBe(PATHS.length);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
  });

  test('distinguishes the two CPU paths from each other', () => {
    // The demo advertises a compute shader; conflating WASM-on-CPU with
    // WebGPU is exactly the claim that was previously unverifiable on screen.
    expect(simPathLabel('wasm')).not.toBe(simPathLabel('js'));
    expect(simPathLabel('webgpu')).toContain('WebGPU');
    expect(simPathLabel('wasm')).toContain('CPU');
    expect(simPathLabel('js')).toContain('CPU');
  });
});

describe('SHELL_MAX_FPS', () => {
  test('is uncapped', () => {
    // The shell deliberately runs at the display's native refresh rate so
    // Stream Reader's FPS panel reflects the real screen. A creation that
    // restored a hardcoded 60 on unmount is what capped every later creation.
    expect(SHELL_MAX_FPS).toBe(0);
  });

  test('is a number the Scene accepts as a cap', () => {
    expect(Number.isFinite(SHELL_MAX_FPS)).toBe(true);
    expect(SHELL_MAX_FPS).toBeGreaterThanOrEqual(0);
  });
});
