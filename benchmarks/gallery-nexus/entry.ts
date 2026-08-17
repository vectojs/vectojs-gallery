import { Scene, WebGPUParticleSystemManager } from '@vectojs/core';
import {
  awaitStart,
  calibrateRefreshRate,
  reportFailure,
  reportResult,
} from '../../../../../vectojs/benchmarks/_shared/client';
import { percentile, summarize } from '../../../../../vectojs/benchmarks/_shared/stats';
import { GALLERY_SCENE_OPTIONS } from '../../src/shell-config';
import { FULL_RAIL_WIDTH } from '../../src/ui/shell-layout';
import Nexus from '../../src/creations/nexus';

// Opt the Scene into the WebGPU particle compute pass, exactly as the gallery
// shell does before constructing any Scene (see src/main.ts).
Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager);

const params = new URLSearchParams(location.search);
const FRAMES = Number(params.get('frames') ?? 180);
const TRIALS = Number(params.get('trials') ?? 5);
const WARMUP_MS = Number(params.get('warmupMs') ?? 1500);

/** Drive `frames` real rAF callbacks, timing each `scene.step()` synchronously. */
function stepFrames(scene: Scene, budgetMs: number, frames: number): Promise<number[]> {
  return new Promise((resolve) => {
    const costs: number[] = [];
    let frame = 0;
    const loop = (): void => {
      const t0 = performance.now();
      scene.step(budgetMs);
      costs.push(performance.now() - t0);
      frame += 1;
      if (frame >= frames) {
        resolve(costs);
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function main(): Promise<void> {
  await awaitStart();
  const refreshHz = await calibrateRefreshRate(1000);
  const budgetMs = 1000 / refreshHz;
  const started = performance.now();

  const canvas = document.createElement('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);

  const scene = new Scene(canvas, GALLERY_SCENE_OPTIONS);
  // The shell fire-and-forgets scene.enableWasmParticles(coreWasmUrl) after
  // start(), but that subpath (@vectojs/core/wasm -> src/wasm/asset.ts) does not
  // resolve under the shared benchmark source plugin, and the WASM kernel needs
  // a dedicated wasm-copy build (see benchmarks/particle-wasm). WebGPU is the
  // preferred path on this host, so we omit the WASM fallback and record the
  // settled path ('webgpu' or 'js') from scene.accelerators.particle.path.

  const rail = FULL_RAIL_WIDTH;
  const nexus = new Nexus();
  nexus.setPosition(rail, 0);
  nexus.resizeTo(innerWidth - rail, innerHeight);
  scene.add(nexus);

  // Warm up on real frames so the async WebGPU device request resolves, the
  // reported particle path settles, and the hot path JITs. Stepping is real
  // particle work; every await yields a real animation frame.
  const warmupStart = performance.now();
  while (performance.now() - warmupStart < WARMUP_MS) {
    scene.step(budgetMs);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  const particle = scene.accelerators.particle;
  const particleCount = (nexus as unknown as { particleCount: number }).particleCount;

  const costs: number[] = [];
  for (let trial = 0; trial < TRIALS; trial++) {
    costs.push(...(await stepFrames(scene, budgetMs, FRAMES)));
  }

  const stats = summarize(costs);
  const p99 = percentile(costs, 0.99);
  const budgetHitSharePct =
    (100 * costs.filter((value) => value <= budgetMs).length) / costs.length;

  const summary = {
    path: particle.path,
    reason: particle.reason,
    backendAvailable: particle.available,
    particleCount,
    budgetMs: +budgetMs.toFixed(4),
    refreshHz: +refreshHz.toFixed(2),
    frameP50Ms: +stats.median.toFixed(4),
    frameP99Ms: +p99.toFixed(4),
    frameMaxMs: +stats.max.toFixed(4),
    frameMadMs: +stats.mad.toFixed(4),
    budgetHitSharePct: +budgetHitSharePct.toFixed(1),
    samples: stats.n,
  };

  const result = await reportResult({
    name: 'gallery-nexus',
    params: {
      frames: FRAMES,
      trials: TRIALS,
      warmupMs: WARMUP_MS,
      rail,
      measurement:
        'One scene.step(budgetMs) per real requestAnimationFrame callback, timed with performance.now(). budgetMs = 1000 / calibrated refreshHz, so dt matches the nominal refresh period.',
    },
    summary,
    rows: [],
    durationMs: +(performance.now() - started).toFixed(1),
  });

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);

  scene.destroy();
}

main().catch((error) => reportFailure('gallery-nexus', error));
