import { describe, expect, test } from 'bun:test';
import { Slider, Text } from '@vectojs/ui';
import { clampSliderMaximum } from '../src/creations/compare-pretext/demos/bubbles';
import { LinePool } from '../src/creations/compare-pretext/shared/LinePool';
import {
  advanceFixedSteps,
  PHYSICS_STEP_MS,
  timelineProgress,
} from '../src/creations/compare-pretext/shared/timing';

describe('compare-pretext layout and timing correctness', () => {
  test('rebuilds pooled Text when font layout inputs change', () => {
    const pool = new LinePool();
    const firstLine = {
      x: 0,
      y: 0,
      text: 'same text',
      font: '12px sans-serif',
      color: '#fff',
      lineHeight: 16,
    };

    pool.setLines([firstLine]);
    const first = pool.children[0] as Text;
    pool.setLines([{ ...firstLine, font: '24px serif', lineHeight: 30 }]);
    const rebuilt = pool.children[0] as Text;

    expect(rebuilt).not.toBe(first);
    expect(rebuilt.font).toBe('24px serif');
    expect(rebuilt.lineHeight).toBe(30);
    expect(rebuilt.height).toBe(30);
  });

  test('preserves projected line order while replacing a styled line', () => {
    const pool = new LinePool();
    const line = (text: string, font = '12px sans-serif') => ({
      x: 0,
      y: 0,
      text,
      font,
      color: '#fff',
      lineHeight: 16,
    });
    pool.setLines([line('first'), line('second')]);

    pool.setLines([line('first', '700 12px sans-serif'), line('second')]);

    expect((pool.children[0] as Text).text).toBe('first');
    expect((pool.children[1] as Text).text).toBe('second');
  });

  test('clamps Slider.value when a responsive maximum shrinks', () => {
    const slider = new Slider({ min: 240, max: 620, value: 560 });

    expect(clampSliderMaximum(slider, 360)).toBe(360);
    expect(slider.max).toBe(360);
    expect(slider.value).toBe(360);
    expect(slider.getA11yAttributes()).toMatchObject({
      value: '360',
      valuemax: '360',
    });
  });

  test('runs the same fixed physics steps across refresh cadences', () => {
    const run = (refreshHz: number) => {
      let remainder = 0;
      let steps = 0;
      for (let i = 0; i < refreshHz * 2; i++) {
        remainder = advanceFixedSteps(remainder, 1000 / refreshHz, () => steps++);
      }
      return { remainder, steps };
    };

    for (const refreshHz of [60, 120, 240]) {
      const result = run(refreshHz);
      expect(result.steps).toBe(120);
      expect(result.remainder).toBeCloseTo(0, 8);
    }
    expect(PHYSICS_STEP_MS).toBeCloseTo(1000 / 60, 10);
  });

  test('derives rotation progress only from the supplied Scene timeline', () => {
    expect(timelineProgress(1_000, 1_000, 800)).toBe(0);
    expect(timelineProgress(1_400, 1_000, 800)).toBe(0.5);
    expect(timelineProgress(1_800, 1_000, 800)).toBe(1);
    expect(timelineProgress(2_600, 1_000, 800)).toBe(1);
  });
});
