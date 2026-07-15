import type { Scene } from "@vectojs/core";

/**
 * Keep a continuously-animated scene rendering at full rate despite the idle
 * auto-throttle added in core@0.1.0 (a "static" scene — no dirty flag, no pending
 * tween — drops to ~2 FPS). Demos that move entities by hand in `update()` aren't
 * seen as animating, and marking dirty *inside* `update()` is futile: the loop
 * resets `dirty` right after rendering. So we mark dirty from a standalone rAF
 * that runs *between* frames.
 *
 * `active()` gates the pump — return `false` (e.g. while paused) to let the scene
 * throttle and save resources. Returns a stop function.
 */
export function keepSceneLive(
  scene: Scene,
  active: () => boolean = () => true,
): () => void {
  let running = true;
  const pump = (): void => {
    if (!running) return;
    if (active()) scene.markDirty();
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  return () => {
    running = false;
  };
}
