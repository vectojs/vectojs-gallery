import { afterEach, describe, expect, test } from 'bun:test';
import type { Scene } from '@vectojs/core';
import { ScrollView } from '@vectojs/ui';
import { keepSceneLive } from '../src/keep-live';
import { CREATIONS } from '../src/registry';
import { Bed } from '../src/ui/Bed';

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

afterEach(() => {
  if (originalRequestAnimationFrame)
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
});

function wheelEvent(deltaY: number): Record<string, unknown> {
  return {
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    preventDefault() {},
  };
}

describe('catalog scheduling', () => {
  test('uses monotonic document scrolling and invalidates on input', () => {
    let invalidations = 0;
    const bed = new Bed(
      1000,
      100,
      () => {},
      () => invalidations++,
    );
    bed.resize(1000, 100, CREATIONS);
    const scroll = (bed as unknown as { scroll: ScrollView }).scroll;

    invalidations = 0;
    scroll.emit('wheel', wheelEvent(240));
    expect(invalidations).toBe(1);

    let previous = scroll.content.y;
    let reversals = 0;
    for (let frame = 0; frame < 600; frame++) {
      scroll.update(16, frame * 16);
      scroll.content.update(16, frame * 16);
      const delta = scroll.content.y - previous;
      if (delta > 1e-6) reversals++;
      previous = scroll.content.y;
    }

    expect(reversals).toBe(0);
    expect(scroll.content.y).toBeCloseTo(-240, 0);
  });

  test('stops the keep-live pump when a continuous creation closes', () => {
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      frames.push(callback);
      return frames.length;
    };

    let dirtyCount = 0;
    const scene = { markDirty: () => dirtyCount++ } as unknown as Scene;
    const stop = keepSceneLive(scene);

    frames.shift()?.(0);
    expect(dirtyCount).toBe(1);

    stop();
    frames.shift()?.(16);
    expect(dirtyCount).toBe(1);
    expect(frames).toHaveLength(0);
  });
});
