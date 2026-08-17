export const PHYSICS_STEP_MS = 1000 / 60;

/** Advance deterministic fixed steps while retaining the fractional remainder. */
export function advanceFixedSteps(
  accumulatorMs: number,
  dtMs: number,
  step: () => void,
  stepMs = PHYSICS_STEP_MS,
): number {
  let remaining = accumulatorMs + Math.max(0, dtMs);
  while (remaining + Number.EPSILON >= stepMs) {
    step();
    remaining -= stepMs;
  }
  return remaining;
}

export function timelineProgress(time: number, start: number, duration: number): number {
  return Math.max(0, Math.min(1, (time - start) / duration));
}
