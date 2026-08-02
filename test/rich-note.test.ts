import { describe, expect, test } from 'bun:test';
import { OBJECT_REPLACEMENT } from '@vectojs/core';
import {
  CHIP_CHROME_WIDTH,
  CHIP_DEPTH,
  CHIP_HEIGHT,
  CHIP_TONE,
  chipAlt,
  chipObject,
  chipRasterKey,
  chipWidth,
  type ChipTone,
  type LabelMeasurer,
} from '../src/creations/compare-pretext/demos/rich-note-chips';
import {
  buildNoteSpans,
  noteAccessibleText,
  ROLE_STYLE,
  SPECS,
} from '../src/creations/compare-pretext/demos/rich-note-content';

/**
 * Deterministic stand-in for canvas text measurement, so these tests assert the
 * chip/span arithmetic rather than the host's installed font stack.
 */
const fakeMeasure: LabelMeasurer = (label) => label.length * 6;

describe('chip inline objects', () => {
  test('a chip reserves its label width plus the chrome it is drawn inside', () => {
    // The advance and the raster must agree, or the engine reserves a box the
    // bitmap does not fill (the gap defect this rebuild exists to remove).
    expect(chipWidth('P1', fakeMeasure)).toBe(2 * 6 + CHIP_CHROME_WIDTH);
    expect(chipWidth('3 reviewers', fakeMeasure)).toBe(11 * 6 + CHIP_CHROME_WIDTH);
  });

  test('metrics are final pixels, not scaled by the surrounding run', () => {
    const chip = chipObject('P1', 'priority', fakeMeasure);
    expect(chip.height).toBe(CHIP_HEIGHT);
    expect(chip.width).toBe(chipWidth('P1', fakeMeasure));
  });

  test('the chip box straddles the baseline instead of sitting on it', () => {
    // `depth` is how far the box extends BELOW the baseline. A 24px box against
    // a 17px run has to hang a little to look centered on the text; zero depth
    // sits it entirely on the baseline and reads as floating high, while half
    // the height or more reads as dropped.
    const chip = chipObject('P1', 'priority', fakeMeasure);
    expect(chip.depth).toBeGreaterThan(0);
    expect(chip.depth).toBeLessThan(CHIP_HEIGHT / 2);
    expect(CHIP_DEPTH).toBeGreaterThan(0);
  });

  test('alt encodes the tone, so it uniquely determines the pixels', () => {
    // `InlineObject.paint` is deliberately NOT part of the paragraph memo key
    // while `alt` IS: two objects with equal metrics and equal `alt` share a
    // cached paragraph and the second is served the first's paint closure. Two
    // same-label chips of different tones must therefore differ in `alt`.
    const status = chipObject('ready', 'status', fakeMeasure);
    const priority = chipObject('ready', 'priority', fakeMeasure);
    expect(status.width).toBe(priority.width);
    expect(status.alt).not.toBe(priority.alt);
  });

  test('the raster cache key separates every input that changes pixels', () => {
    const w = chipWidth('ready', fakeMeasure);
    expect(chipRasterKey('ready', 'status', w)).not.toBe(chipRasterKey('ready', 'priority', w));
    expect(chipRasterKey('ready', 'status', w)).not.toBe(chipRasterKey('ready', 'status', w + 1));
    expect(chipRasterKey('ready', 'status', w)).toBe(chipRasterKey('ready', 'status', w));
  });

  test('every tone used by the content has a palette entry', () => {
    for (const spec of SPECS) {
      if (spec.kind !== 'chip') continue;
      expect(CHIP_TONE[spec.tone]).toBeDefined();
    }
  });
});

describe('note spans', () => {
  test('a chip span carries exactly one sentinel character', () => {
    // The engine keys on this exact single character to reserve `object.width`;
    // a span whose text is anything else silently ignores its `object`.
    const spans = buildNoteSpans(SPECS, fakeMeasure);
    const chips = spans.filter((s) => s.object !== undefined);
    expect(chips.length).toBe(SPECS.filter((s) => s.kind === 'chip').length);
    for (const chip of chips) {
      expect(chip.text).toBe(OBJECT_REPLACEMENT);
      expect(chip.text.length).toBe(1);
    }
  });

  test('a span is either text or an object, never both', () => {
    for (const span of buildNoteSpans(SPECS, fakeMeasure)) {
      if (span.object !== undefined) {
        expect(span.text).toBe(OBJECT_REPLACEMENT);
        expect(span.style).toBeUndefined();
      } else {
        expect(span.text).not.toBe(OBJECT_REPLACEMENT);
        expect(span.text.length).toBeGreaterThan(0);
      }
    }
  });

  test('text spans keep their role styling', () => {
    const spans = buildNoteSpans(
      [
        { kind: 'text', text: 'plain', style: 'body' },
        { kind: 'text', text: 'code()', style: 'code' },
        { kind: 'text', text: 'a link', style: 'link' },
      ],
      fakeMeasure,
    );
    expect(spans[0]?.style).toBe(ROLE_STYLE.body);
    expect(spans[1]?.style).toBe(ROLE_STYLE.code);
    expect(spans[2]?.style).toBe(ROLE_STYLE.link);
  });

  test('code runs are smaller and monospaced; links are emphasized', () => {
    expect(ROLE_STYLE.code.fontSize).toBe(14);
    expect(ROLE_STYLE.code.fontFamily).toContain('mono');
    expect(ROLE_STYLE.link.bold).toBe(true);
    // Body inherits the base size, so it must not pin one of its own.
    expect(ROLE_STYLE.body.fontSize).toBeUndefined();
  });

  test('one span per spec, in source order', () => {
    const spans = buildNoteSpans(SPECS, fakeMeasure);
    expect(spans.length).toBe(SPECS.length);
    expect(spans[0]?.text).toBe('Ship ');
    expect(spans[spans.length - 1]?.text).toBe('.');
  });
});

describe('accessible text', () => {
  test('chips contribute their alt in place of the sentinel', () => {
    const text = noteAccessibleText(SPECS);
    expect(text).not.toContain(OBJECT_REPLACEMENT);
    for (const spec of SPECS) {
      if (spec.kind === 'chip') {
        expect(text).toContain(chipAlt(spec.label, spec.tone));
      }
    }
  });

  test('reading order matches the sentence, with no inserted whitespace', () => {
    // The old structure split this into ~88 sibling entities whose mirrors were
    // sorted by mixed-space coordinates, scrambling copy. One text object keeps
    // source order by construction.
    const text = noteAccessibleText(SPECS);
    expect(text.startsWith('Ship @maya (mention)')).toBe(true);
    expect(text.endsWith('route feedback to design sync.')).toBe(true);
    expect(text).toContain('北京');
    expect(text).toContain('عربي');
  });

  test('the multilingual and emoji content survives verbatim', () => {
    const text = noteAccessibleText(SPECS);
    for (const fragment of ['中文', 'جاهز (status)', '✅', '🚀', 'layoutNextLine()']) {
      expect(text).toContain(fragment);
    }
  });
});

describe('content integrity', () => {
  test('the five chip tones each appear exactly once', () => {
    const counts = new Map<ChipTone, number>();
    for (const spec of SPECS) {
      if (spec.kind !== 'chip') continue;
      counts.set(spec.tone, (counts.get(spec.tone) ?? 0) + 1);
    }
    expect(counts.get('mention')).toBe(1);
    expect(counts.get('priority')).toBe(1);
    expect(counts.get('time')).toBe(1);
    expect(counts.get('count')).toBe(1);
    // `status` is used twice on purpose: once Latin, once Arabic.
    expect(counts.get('status')).toBe(2);
  });

  test('no text spec carries a doubled space at a chip boundary', () => {
    // A leading space on the spec after a chip would reintroduce the spurious
    // gap the old per-word Flow produced.
    SPECS.forEach((spec, i) => {
      if (spec.kind !== 'text') return;
      const prev = SPECS[i - 1];
      if (prev?.kind !== 'chip') return;
      expect(spec.text.startsWith('  ')).toBe(false);
    });
  });
});
