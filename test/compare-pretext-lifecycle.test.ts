import { describe, expect, test } from 'bun:test';
import { AsyncGeneration } from '../src/creations/compare-pretext/shared/async-generation';
import { ScrollColumn } from '../src/creations/compare-pretext/shared/ScrollColumn';

describe('compare-pretext lifecycle and selection boundaries', () => {
  test('invalidates older lazy demo loads and destroy continuations', () => {
    const gate = new AsyncGeneration();
    const first = gate.next();
    const second = gate.next();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);

    gate.destroy();
    expect(gate.isCurrent(second)).toBe(false);
    expect(gate.isCurrent(gate.next())).toBe(false);
  });

  test('projects the viewport as pointer-transparent and claims only its drag band', () => {
    const column = new ScrollColumn(300, 200);

    expect(column.getA11yAttributes()).toEqual({ pointerEvents: 'none' });
    expect(column.isPointInside(40, 80)).toBe(false);
    expect(column.isPointInside(287, 80)).toBe(true);
    expect(column.isPointInside(299, 199)).toBe(true);
    expect(column.isPointInside(301, 80)).toBe(false);
  });
});
