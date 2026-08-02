import { describe, expect, test } from 'bun:test';
import { clampTagsToWidth, type MeasurableText } from '../src/ui/clamp';
import { fittedTitleSize, layOutBadges, wrapTagline, TITLE_SIZE_MIN } from '../src/ui/Masthead';
import { CREATIONS } from '../src/registry';

/**
 * A `Text` stand-in whose width is a deterministic function of the string, so
 * these tests assert the fit *logic* without a canvas. Real glyph widths vary by
 * installed font (Archivo Black is absent on CI), which would make an assertion
 * against measured pixels a test of the host's font stack.
 */
function fakeText(perChar = 6): MeasurableText & { text: string } {
  return {
    text: '',
    setText(next: string) {
      this.text = next;
      return this;
    },
    get width() {
      return this.text.length * perChar;
    },
  };
}

/** Monospace-ish fake measurer: width scales with length and font size. */
function fakeMeasurer(text: string, font: string): number {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 16);
  return text.length * size * 0.6;
}

describe('clampTagsToWidth', () => {
  const SEP = ' · ';

  test('leaves a tag list that already fits untouched', () => {
    const t = fakeText();
    clampTagsToWidth(t, ['A', 'B'], SEP, 1000);
    expect(t.text).toBe('A · B');
  });

  test('drops trailing tags and reports the elided count', () => {
    const t = fakeText();
    // All three is 37 chars = 222px at 6px/char; dropping one gives 27 = 162px.
    // Budget 170 so exactly the one-dropped arrangement fits.
    clampTagsToWidth(t, ['Text Layout', 'Comparison', 'Typography'], SEP, 170);
    expect(t.text).toBe('Text Layout · Comparison +1');
    expect(t.width).toBeLessThanOrEqual(170);
  });

  test('drops more than one tag when the budget demands it', () => {
    const t = fakeText();
    clampTagsToWidth(t, ['Editor', 'Interaction', 'Serialization'], SEP, 80);
    expect(t.text).toBe('Editor +2');
    expect(t.width).toBeLessThanOrEqual(80);
  });

  test('keeps at least one tag even when nothing fits', () => {
    const t = fakeText();
    clampTagsToWidth(t, ['Editor', 'Interaction', 'Serialization'], SEP, 5);
    // A bare '+3' would name nothing, so the floor is one real tag.
    expect(t.text).toBe('Editor +2');
  });

  test('a single tag is never rewritten into a count', () => {
    const t = fakeText();
    clampTagsToWidth(t, ['Serialization'], SEP, 10);
    expect(t.text).toBe('Serialization');
  });

  test('every registry tag set fits the narrowest real card', () => {
    // Card width oscillates ~250-300px because the column count snaps down;
    // 262px is the measured worst case (4 columns at a 1440px window).
    const budget = 262 - 16 * 2 - 8 * 2;
    for (const creation of CREATIONS) {
      const t = fakeText();
      clampTagsToWidth(t, creation.tags, SEP, budget);
      expect(t.width).toBeLessThanOrEqual(budget);
      // Whatever survives must still name at least one real tag.
      expect(t.text.startsWith(creation.tags[0])).toBe(true);
    }
  });
});

describe('fittedTitleSize', () => {
  test('uses the full size when the headline fits', () => {
    expect(fittedTitleSize(10_000, fakeMeasurer)).toBe(46);
  });

  test('shrinks until the headline fits its band', () => {
    const width = 300;
    const size = fittedTitleSize(width, fakeMeasurer);
    expect(size).toBeLessThan(46);
    expect(fakeMeasurer('Made with VectoJS', `400 ${size}px x`)).toBeLessThanOrEqual(width);
    // And it is the *largest* such size — one step up must not fit.
    expect(fakeMeasurer('Made with VectoJS', `400 ${size + 1}px x`)).toBeGreaterThan(width);
  });

  test('floors at the minimum rather than shrinking indefinitely', () => {
    // A width that a BELOW-floor size would fit is the only case that
    // distinguishes the floor from its absence: at a width where nothing fits at
    // any size, the loop's fallthrough returns the floor either way.
    const width = 140;
    const size = fittedTitleSize(width, fakeMeasurer);
    expect(size).toBe(TITLE_SIZE_MIN);
    // It really is an overflow the floor chose to accept.
    expect(fakeMeasurer('Made with VectoJS', `400 ${size}px x`)).toBeGreaterThan(width);
    // And a smaller size genuinely would have fit, so the floor is load-bearing.
    expect(fakeMeasurer('Made with VectoJS', `400 ${TITLE_SIZE_MIN - 8}px x`)).toBeLessThanOrEqual(
      width,
    );
  });
});

describe('wrapTagline', () => {
  const TAGLINE = 'Interactive pieces and full applications rendered entirely on canvas.';

  test('leaves a tagline that fits on one line', () => {
    expect(wrapTagline(TAGLINE, 10_000, fakeMeasurer)).toEqual([TAGLINE]);
  });

  test('wraps at word boundaries, never mid-word', () => {
    const lines = wrapTagline(TAGLINE, 300, fakeMeasurer);
    expect(lines.length).toBeGreaterThan(1);
    // Rejoining must reproduce the source exactly - no dropped or split words.
    expect(lines.join(' ')).toBe(TAGLINE);
    for (const line of lines) {
      expect(fakeMeasurer(line, '400 15px x')).toBeLessThanOrEqual(300);
    }
  });

  test('narrower widths never produce fewer lines', () => {
    const count = (w: number) => wrapTagline(TAGLINE, w, fakeMeasurer).length;
    expect(count(200)).toBeGreaterThanOrEqual(count(400));
    expect(count(400)).toBeGreaterThanOrEqual(count(800));
  });

  test('a single unbreakable word overflows rather than being split', () => {
    const lines = wrapTagline('Supercalifragilistic', 10, fakeMeasurer);
    expect(lines).toEqual(['Supercalifragilistic']);
  });

  test('a non-positive width degrades to one line instead of looping', () => {
    expect(wrapTagline(TAGLINE, 0, fakeMeasurer)).toEqual([TAGLINE]);
  });
});

describe('layOutBadges', () => {
  const LABELS = ['core 1.27.1', 'ui 2.8.0', '6 creations', '6 apps'];

  test('keeps every badge on one row when there is room', () => {
    const boxes = layOutBadges(LABELS, 10_000, fakeMeasurer);
    expect(boxes.length).toBe(LABELS.length);
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
  });

  test('no badge ever extends past the band width', () => {
    for (const width of [1440, 800, 520, 360]) {
      for (const box of layOutBadges(LABELS, width, fakeMeasurer)) {
        // A row always takes at least one badge, so only a badge wider than the
        // entire band may overflow — none of these are.
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
  });

  test('wraps to further rows as the band narrows', () => {
    const rows = (w: number) => new Set(layOutBadges(LABELS, w, fakeMeasurer).map((b) => b.y)).size;
    expect(rows(10_000)).toBe(1);
    expect(rows(300)).toBeGreaterThan(1);
    // Monotonic: narrower never means fewer rows.
    expect(rows(200)).toBeGreaterThanOrEqual(rows(300));
  });

  test('rows advance by a fixed pitch and never overlap', () => {
    const boxes = layOutBadges(LABELS, 300, fakeMeasurer);
    const ys = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBe(24 + 8);
    }
  });
});
