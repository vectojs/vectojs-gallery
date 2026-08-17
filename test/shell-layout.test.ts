import { describe, expect, test } from 'bun:test';
import { clampTagsToWidth, type MeasurableText } from '../src/ui/clamp';
import { fittedTitleSize, layOutBadges, wrapTagline, TITLE_SIZE_MIN } from '../src/ui/Masthead';
import { CREATIONS } from '../src/registry';
import { Bed, getCatalogMetrics } from '../src/ui/Bed';
import { compactSubtitle } from '../src/ui/SectionHeader';
import {
  COLLAPSED_RAIL_WIDTH,
  COMPACT_NAV_HEIGHT,
  FULL_RAIL_WIDTH,
  getShellLayout,
  shellMode,
} from '../src/ui/shell-layout';

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

describe('responsive shell layout', () => {
  test('uses denser editorial spacing without collapsing the mobile gutter', () => {
    expect(getCatalogMetrics(320)).toEqual({
      padding: 20,
      gap: 14,
      sectionGap: 32,
      bottomPad: 40,
    });
    expect(getCatalogMetrics(768).padding).toBe(28);
    expect(getCatalogMetrics(1440).padding).toBe(32);
  });

  test('uses concise section copy where long editorial subtitles would clip', () => {
    expect(compactSubtitle('Creations')).toBe('Live, canvas-native pieces.');
    expect(compactSubtitle('Built on VectoJS')).toBe('Applications built on VectoJS.');
  });

  test('uses the three editorial shell modes at their boundaries', () => {
    expect(shellMode(320)).toBe('compact');
    expect(shellMode(767)).toBe('compact');
    expect(shellMode(768)).toBe('medium');
    expect(shellMode(1439)).toBe('medium');
    expect(shellMode(1440)).toBe('wide');
  });

  test('keeps every content band inside the viewport', () => {
    for (const width of [320, 360, 560, 768, 1024, 1440, 1920]) {
      const layout = getShellLayout(width, 800);
      expect(layout.contentX).toBeGreaterThanOrEqual(0);
      expect(layout.contentY).toBeGreaterThanOrEqual(0);
      expect(layout.contentX + layout.contentWidth).toBeLessThanOrEqual(width);
      expect(layout.contentY + layout.contentHeight).toBeLessThanOrEqual(800);
      if (layout.mode === 'compact') expect(layout.railHeight).toBe(COMPACT_NAV_HEIGHT);
      if (layout.mode === 'medium') expect(layout.railWidth).toBe(COLLAPSED_RAIL_WIDTH);
      if (layout.mode === 'wide') expect(layout.railWidth).toBe(FULL_RAIL_WIDTH);
    }
  });

  test('keeps the integrated catalog document inside all target content bands', () => {
    for (const viewportWidth of [320, 360, 560, 768, 1024, 1440, 1920]) {
      const layout = getShellLayout(viewportWidth, 800);
      const bed = new Bed(layout.contentWidth, layout.contentHeight, () => {});
      bed.resize(layout.contentWidth, layout.contentHeight, CREATIONS);
      const content = (
        bed as unknown as {
          scroll: {
            content: { children: { id: string; x: number; width: number }[] };
          };
        }
      ).scroll.content;

      for (const child of content.children) {
        expect(child.x).toBeGreaterThanOrEqual(0);
        expect(child.x + child.width).toBeLessThanOrEqual(layout.contentWidth);
      }
    }
  });

  test('supports a compact viewport shorter than the top navigation', () => {
    const layout = getShellLayout(360, 40);
    expect(layout.railHeight).toBe(40);
    expect(layout.contentHeight).toBe(0);
  });

  test('keeps the ScrollView, cards, and scroll offset across relayouts', () => {
    const bed = new Bed(1000, 100, () => {});
    bed.resize(1000, 100, CREATIONS);

    const internals = bed as unknown as {
      scroll: {
        content: { y: number; children: { id: string }[] };
        scrollTo(y: number): void;
      };
    };
    const scroll = internals.scroll;
    const card = scroll.content.children.find((child) => child.id === 'CreationCard:studio');
    const childCount = scroll.content.children.length;
    scroll.scrollTo(200);
    for (let frame = 0; frame < 300; frame++) {
      (scroll.content as unknown as { update(dt: number, time: number): void }).update(
        16,
        frame * 16,
      );
    }

    bed.resize(648, 100, CREATIONS);
    bed.resize(1096, 100, CREATIONS);

    expect(internals.scroll).toBe(scroll);
    expect(scroll.content.children.find((child) => child.id === 'CreationCard:studio')).toBe(card);
    expect(scroll.content.children.length).toBe(childCount);
    expect(scroll.content.y).toBe(-200);
  });
});
