import { Scene } from '@vectojs/core';
import {
  awaitStart,
  calibrateRefreshRate,
  reportFailure,
  reportResult,
} from '../../../vectojs/benchmarks/_shared/client';
import { median } from '../../../vectojs/benchmarks/_shared/stats';
import { APPS } from '../../src/apps';
import { CREATIONS } from '../../src/registry';
import { GALLERY_SCENE_OPTIONS } from '../../src/shell-config';
import { Bed } from '../../src/ui/Bed';

const TRIALS = Number(new URLSearchParams(location.search).get('trials') ?? 12);
let refreshRate = 0;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summary(
  values: number[],
  frameBudgetMs: number,
): {
  p50Ms: number;
  p99Ms: number;
  budgetHitSharePct: number;
  samples: number;
} {
  return {
    p50Ms: +median(values).toFixed(4),
    p99Ms: +percentile(values, 0.99).toFixed(4),
    budgetHitSharePct: +(
      (100 * values.filter((value) => value <= frameBudgetMs).length) /
      values.length
    ).toFixed(1),
    samples: values.length,
  };
}

function makeCatalog(): { scene: Scene; bed: Bed } {
  const canvas = document.createElement('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);
  const scene = new Scene(canvas, GALLERY_SCENE_OPTIONS);
  const bed = new Bed(
    innerWidth - 56,
    innerHeight,
    () => {},
    () => scene.markDirty(),
  );
  bed.setPosition(56, 0);
  bed.resize(innerWidth - 56, innerHeight, CREATIONS);
  scene.add(bed);
  return { scene, bed };
}

function measureCatalogOperations(): {
  scroll: ReturnType<typeof summary>;
  resize: ReturnType<typeof summary>;
  projection: ReturnType<typeof summary>;
  frameBudgetMs: number;
} {
  const frameBudgetMs = 1000 / refreshRate;
  const { scene, bed } = makeCatalog();
  const scrollValues: number[] = [];
  const resizeValues: number[] = [];
  const projectionValues: number[] = [];
  const scroll = (bed as any).scroll;

  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now();
    scroll.scrollTo(240);
    scene.step(frameBudgetMs);
    scrollValues.push(performance.now() - t0);

    const width = i % 2 === 0 ? 648 : 1096;
    const resizeStart = performance.now();
    bed.resize(width, innerHeight, CREATIONS);
    scene.step(frameBudgetMs);
    resizeValues.push(performance.now() - resizeStart);

    const projectionStart = performance.now();
    (scene as any).syncA11y((scene as any).root);
    projectionValues.push(performance.now() - projectionStart);
  }
  scene.destroy();
  return {
    scroll: summary(scrollValues, frameBudgetMs),
    resize: summary(resizeValues, frameBudgetMs),
    projection: summary(projectionValues, frameBudgetMs),
    frameBudgetMs,
  };
}

async function measureMountLatency(): Promise<{ id: string; p50Ms: number; p99Ms: number }[]> {
  const rows: { id: string; p50Ms: number; p99Ms: number }[] = [];
  for (const creation of CREATIONS) {
    const values: number[] = [];
    for (let i = 0; i < Math.max(3, Math.ceil(TRIALS / 2)); i++) {
      const started = performance.now();
      const { default: EntityClass } = await creation.load();
      const entity = new EntityClass();
      entity.destroy();
      values.push(performance.now() - started);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    rows.push({
      id: creation.id,
      p50Ms: +median(values).toFixed(4),
      p99Ms: +percentile(values, 0.99).toFixed(4),
    });
  }
  return rows;
}

async function measureIdle(): Promise<{
  renderedFrames: number;
  skippedFrames: number;
  waitMs: number;
}> {
  const { scene } = makeCatalog();
  scene.renderMode = 'onDemand';
  scene.start();
  await new Promise<void>((resolve) => setTimeout(resolve, 700));
  const before = scene.frameStats;
  scene.markDirty();
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  const after = scene.frameStats;
  scene.stop();
  scene.destroy();
  return {
    renderedFrames: after.renderedFrames - before.renderedFrames,
    skippedFrames: after.skippedFrames - before.skippedFrames,
    waitMs: 1000,
  };
}

async function main(): Promise<void> {
  await awaitStart();
  refreshRate = await calibrateRefreshRate();
  const started = performance.now();
  const operations = measureCatalogOperations();
  const mounts = await measureMountLatency();
  const idle = await measureIdle();
  const result = await reportResult({
    name: 'gallery-envelope',
    params: {
      trials: TRIALS,
      refreshHz: refreshRate,
      creations: CREATIONS.length,
      apps: APPS.length,
    },
    summary: { operations, mounts, idle },
    rows: [],
    syntheticFrames: true,
    durationMs: +(performance.now() - started).toFixed(1),
  });
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
}

main().catch((error) => reportFailure('gallery-envelope', error));
