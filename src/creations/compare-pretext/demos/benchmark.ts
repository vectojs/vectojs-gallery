/**
 * benchmark — the actual head-to-head against pretext.
 *
 * The other demos in this Creation reimplement pretext's public demos on
 * VectoJS, which shows the engine can express the same layouts. They do NOT
 * measure pretext: until this file, `@chenglou/pretext` was not a dependency of
 * this gallery at all, so any performance claim here was unsupported.
 *
 * This runs both libraries over the same corpus in the same frame. Both expose
 * the same two-phase shape:
 *
 *   pretext   prepare(text, font)            → layout(prepared, maxWidth, lineHeight)
 *   VectoJS   engine.prepare(text, atlas, s) → engine.measurePrepared(prepared)
 *                                            → engine.layoutPrepared(prepared)
 *
 * `layout()` and `measurePrepared()` both return line count + height, so they
 * are the like-for-like pair. `layoutPrepared()` additionally positions every
 * glyph — strictly more work — and is reported separately rather than being
 * passed off as the same operation.
 */
import {
  Entity,
  LayoutEngine,
  type GlyphAtlas,
  type IRenderer,
} from "@vectojs/core";
import { Text } from "@vectojs/ui";
import {
  prepare as pretextPrepare,
  layout as pretextLayout,
} from "@chenglou/pretext";
import { WARM, FONT } from "../shared/theme";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";

const MEASURE_FONT = FONT.sans(16);
const FONT_SIZE = 16;
/** Widths a resize sweeps through — the hot path both libraries optimize for. */
const WIDTHS = [420, 560, 700, 840];
const TRIALS = 7;
const BLOCKS = 500;

interface Row {
  label: string;
  vectoMs: number;
  pretextMs: number;
  /** > 1 means VectoJS is faster. */
  ratio: number;
  note: string;
  likeForLike: boolean;
}

const median = (xs: number[]): number => {
  xs.sort((a, b) => a - b);
  return xs[xs.length >> 1] ?? 0;
};
const time = (f: () => void): number => {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
};

function corpus(blocks: number): string[] {
  const s =
    "The quick brown fox jumps over the lazy dog while the examiner records every measurement. ";
  return Array.from({ length: blocks }, (_, i) => s.repeat(1 + (i % 3)));
}

/** Per-glyph advances for the same font, so VectoJS shapes without canvas calls. */
function atlasFor(texts: string[]): GlyphAtlas {
  const atlas: GlyphAtlas = {};
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return atlas;
  ctx.font = MEASURE_FONT;
  const seen = new Set<string>();
  for (const t of texts) for (const ch of t) seen.add(ch);
  for (const ch of seen) {
    atlas[ch] = {
      width: ctx.measureText(ch).width,
      baseSize: FONT_SIZE,
      ast: null,
    };
  }
  return atlas;
}

export function runBenchmark(blocks = BLOCKS): Row[] {
  const texts = corpus(blocks);
  const atlas = atlasFor(texts);
  const engine = new LayoutEngine(WIDTHS[0] ?? 420, 1e9);

  const vPrepared = texts.map((t) => engine.prepare(t, atlas, FONT_SIZE));
  const pPrepared = texts.map((t) => pretextPrepare(t, MEASURE_FONT));

  const vMeasure = (): void => {
    for (const w of WIDTHS) {
      engine.maxWidth = w;
      for (const p of vPrepared) engine.measurePrepared(p);
    }
  };
  const vFull = (): void => {
    for (const w of WIDTHS) {
      engine.maxWidth = w;
      for (const p of vPrepared) engine.layoutPrepared(p);
    }
  };
  const pLayout = (): void => {
    for (const w of WIDTHS) {
      for (const p of pPrepared) pretextLayout(p, w, 20);
    }
  };

  // Warm every path before timing any of them.
  vMeasure();
  vFull();
  pLayout();

  const measureMs = median(
    Array.from({ length: TRIALS }, () => time(vMeasure)),
  );
  const fullMs = median(Array.from({ length: TRIALS }, () => time(vFull)));
  const pretextMs = median(Array.from({ length: TRIALS }, () => time(pLayout)));

  return [
    {
      label: "Relayout — line count + height",
      vectoMs: measureMs,
      pretextMs,
      ratio: pretextMs / Math.max(measureMs, 1e-6),
      likeForLike: true,
      note: "Like for like: measurePrepared() vs pretext layout(). Both return only lineCount + height.",
    },
    {
      label: "Relayout — positioned glyphs",
      vectoMs: fullMs,
      pretextMs,
      ratio: pretextMs / Math.max(fullMs, 1e-6),
      likeForLike: false,
      note: "NOT like for like: layoutPrepared() also positions every glyph, which pretext's layout() never does. Shown for honesty, not as a result.",
    },
  ];
}

export class BenchmarkDemo extends Entity {
  private viewW = 960;
  private built = false;

  constructor() {
    super("compare-pretext-benchmark");
  }

  /** The launcher calls this after mounting; build once we know the width. */
  resizeTo(width: number, height: number): void {
    this.viewW = width;
    this.width = width;
    this.height = height;
    if (!this.built) {
      this.build();
      this.built = true;
    }
  }

  private build(): void {
    // Running the benchmark is the point of the demo, but it is real work — do
    // it once, on open, never per frame.
    const rows = runBenchmark();
    const maxW = Math.max(320, this.viewW - 96);
    let y = CONTENT_TOP;

    const intro = new Text(
      `${BLOCKS} prose blocks relaid out at ${WIDTHS.length} widths, median of ${TRIALS} runs. ` +
        "Both libraries execute in this frame, on the same corpus, so these numbers reflect your " +
        "hardware and engine rather than a figure quoted from a README.",
      { font: FONT.sans(14), color: WARM.muted, maxWidth: maxW },
    );
    intro.setPosition(48, y);
    this.add(intro);
    y += 68;

    for (const r of rows) {
      const verdict =
        r.ratio >= 1
          ? `${r.ratio.toFixed(2)}x VectoJS faster`
          : `${(1 / r.ratio).toFixed(2)}x pretext faster`;
      const head = new Text(
        `${r.label}  ·  VectoJS ${r.vectoMs.toFixed(2)}ms  ·  pretext ${r.pretextMs.toFixed(2)}ms  ·  ${verdict}`,
        {
          font: FONT.sans(15, 600),
          color: r.likeForLike ? WARM.ink : WARM.faint,
          maxWidth: maxW,
        },
      );
      head.setPosition(48, y);
      this.add(head);
      y += 30;

      const note = new Text(r.note, {
        font: FONT.sans(13),
        color: WARM.muted,
        maxWidth: maxW,
      });
      note.setPosition(48, y);
      this.add(note);
      y += 62;
    }

    const caveat = new Text(
      "Scope differs, and it matters: pretext is text measurement and layout only. It renders " +
        "nothing and has no scene graph, hit-testing, or accessibility layer. VectoJS's layout " +
        "output feeds glyph positions, selection geometry, and the semantic DOM projection. If you " +
        "only need text measurement, pretext is a far smaller dependency.\n\n" +
        "prepare() is deliberately excluded from this table. VectoJS memoizes prepared paragraphs " +
        "internally, so a repeating corpus flatters it there and the comparison would not be like " +
        "for like.",
      { font: FONT.sans(13), color: WARM.faint, maxWidth: maxW },
    );
    caveat.setPosition(48, y + 4);
    this.add(caveat);
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    drawDemoHeader(
      r,
      48,
      "Measured head-to-head",
      "Both libraries, same corpus, same frame — running on your own hardware.",
    );
  }
}

export default BenchmarkDemo;
