/**
 * Particle budgets per simulation path, and the pure selection logic over them.
 *
 * Extracted from the entity so the sizing rules can be tested without a canvas,
 * a GPU, or a Scene.
 */

/** Which implementation actually simulated a frame. */
export type SimPath = 'webgpu' | 'wasm' | 'js';

export interface ParticleBudget {
  min: number;
  max: number;
  step: number;
  initial: number;
}

/**
 * These are keyed off the path that will actually run, not off `navigator.gpu`.
 *
 * Reporting a GPU is not the same as simulating on one: the WebGPU compute pass
 * additionally needs a registered manager (the shell does that in `main.ts`), a
 * successful adapter *and* device request, and no subsequent device loss. Any of
 * those failing drops the field onto the CPU, and a count chosen for a compute
 * shader is catastrophic there — 60k particles is ~60k JS integration steps plus
 * ~60k `arc()` calls flushed in batches of 64 (≈938 `ctx.fill()` calls) on the
 * main thread every frame, which is what made the controls feel unresponsive
 * even though every click was landing.
 */
export const BUDGET: Record<SimPath, ParticleBudget> = {
  webgpu: { min: 5_000, max: 120_000, step: 5_000, initial: 60_000 },
  /** The WASM kernel removes the JS integration cost but not the Canvas2D draw
   *  cost, which is what actually dominates here — so it earns a modest raise
   *  over plain JS, not a GPU-scale one. */
  wasm: { min: 500, max: 24_000, step: 2_000, initial: 8_000 },
  js: { min: 500, max: 6_000, step: 500, initial: 4_000 },
};

/**
 * Narrow an `AcceleratorStatus.path` string to a known budget key.
 *
 * The engine types `path` as an open `string`, and reports several CPU spellings
 * (`'js'`, `'rejected'`, `'unavailable'`) that all mean the same thing here: the
 * main thread is doing the work.
 */
export function simPathFrom(path: string): SimPath {
  if (path === 'webgpu') return 'webgpu';
  if (path === 'wasm') return 'wasm';
  return 'js';
}

/**
 * The count to adopt when the simulation path turns out to be `path`.
 *
 * Only ever clamps downward: raising the count because a faster path appeared
 * would fight a count the user chose with the +/- stepper.
 */
export function clampCountToPath(current: number, path: SimPath): number {
  const { min, max } = BUDGET[path];
  if (current > max) return max;
  if (current < min) return min;
  return current;
}

/**
 * The count to adopt when the simulation path *changes* to `path`.
 *
 * The WebGPU device resolves asynchronously: the first frames after mount
 * report the CPU path and `clampCountToPath` drops the optimistic GPU initial
 * (60k) to the JS maximum (6k), then the device lands and a downward-only
 * clamp would leave the field permanently sparse. When the user has not
 * touched the stepper, restore the optimistic GPU initial; otherwise keep
 * their choice, clamped downward only.
 */
export function resolveCountOnPathChange(
  current: number,
  path: SimPath,
  userAdjusted: boolean,
): number {
  if (!userAdjusted && path === 'webgpu') return BUDGET.webgpu.initial;
  return clampCountToPath(current, path);
}

/** Human-readable name for the on-screen path readout. */
export function simPathLabel(path: SimPath): string {
  if (path === 'webgpu') return 'WebGPU compute';
  if (path === 'wasm') return 'WASM (CPU)';
  return 'JS (CPU)';
}
