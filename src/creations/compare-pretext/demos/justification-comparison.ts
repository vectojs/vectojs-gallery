/**
 * Justification Comparison — port of pretext's justification-comparison demo
 * ("Rivers of white").
 *
 * pretext measures every word/space segment once (`prepareWithSegments`) and
 * then compares three line-break strategies over those cached widths, with no
 * per-frame DOM measurement: greedy (what CSS `text-align: justify` does),
 * greedy over a hyphenated copy, and a simplified Knuth-Plass optimal pass.
 * The optimal column visibly closes the "rivers" the greedy column opens.
 *
 * This port keeps pretext's model math verbatim (badness, DP, metrics, river
 * detection) and only swaps the text source: a canvas `measureText`-based
 * segmenter + a segment-granular greedy line stepper stand in for pretext's
 * `prepareWithSegments`/`layoutNextLine`. Three columns are painted directly
 * via `IRenderer` inside a `ScrollView`.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { ScrollView } from "@vectojs/ui";
import { WARM, FONT as UIFONT } from "../shared/theme";
import { CONTENT_TOP, HEADER_TITLE_Y, drawDemoHeader } from "../shared/chrome";
import {
  PARAGRAPHS,
  FONT,
  FONT_SIZE,
  LINE_HEIGHT,
  PAD,
  PARA_GAP,
  HYPHEN_EXCEPTIONS,
  PREFIXES,
  SUFFIXES,
} from "./justification-data";

const HUGE_BADNESS = 1e8;
const SOFT_HYPHEN = "\u00ad";
const SHORT_LINE_RATIO = 0.6;
const RIVER_THRESHOLD = 1.5;
const INFEASIBLE_SPACE_RATIO = 0.4;
const OVERFLOW_SPACE_RATIO = 0.2;
const TIGHT_SPACE_RATIO = 0.65;

type TrailingMarker = "none" | "soft-hyphen";
type LineEnding = "paragraph-end" | "wrap";
type BreakCandidateKind = "start" | "space" | "soft-hyphen" | "end";

interface LineSegment {
  kind: "text" | "space";
  text: string;
  width: number;
}
interface MeasuredLine {
  segments: LineSegment[];
  wordWidth: number;
  spaceCount: number;
  naturalWidth: number;
  maxWidth: number;
  ending: LineEnding;
  trailingMarker: TrailingMarker;
}
type LineSpacing =
  | { kind: "ragged" }
  | { kind: "overflow" }
  | { kind: "justified"; width: number; isRiver: boolean };
type PositionedLine = MeasuredLine & { y: number; spacing: LineSpacing };
interface QualityMetrics {
  avgDeviation: number;
  maxDeviation: number;
  riverCount: number;
  lineCount: number;
}
interface ColumnFrame {
  colWidth: number;
  totalHeight: number;
  paragraphs: PositionedLine[][];
  metrics: QualityMetrics;
}

/** A word/space/soft-hyphen split of a paragraph, with per-segment widths. */
interface PreparedParagraph {
  segments: string[];
  widths: number[];
}
interface BreakCandidate {
  segIndex: number;
  kind: BreakCandidateKind;
}
interface LineStats {
  wordWidth: number;
  spaceCount: number;
  naturalWidth: number;
  trailingMarker: TrailingMarker;
}

function isSpaceText(t: string): boolean {
  return t.trim().length === 0;
}

// --- canvas measurement (stands in for pretext's prepareWithSegments) ------

function makeMeasurer(): (t: string) => number {
  const ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  const cache = new Map<string, number>();
  if (ctx) ctx.font = FONT;
  return (t: string): number => {
    let w = cache.get(t);
    if (w === undefined) {
      w = ctx ? ctx.measureText(t).width : t.length * FONT_SIZE * 0.5;
      cache.set(t, w);
    }
    return w;
  };
}

/** Split into alternating word / space segments, keeping SHY as its own segment. */
function prepareParagraph(
  text: string,
  measure: (t: string) => number,
): PreparedParagraph {
  const segments: string[] = [];
  const widths: number[] = [];
  const raw = text.split(/(\s+)/);
  for (const token of raw) {
    if (token.length === 0) continue;
    if (isSpaceText(token)) {
      segments.push(" ");
      widths.push(measure(" "));
      continue;
    }
    // Split the word around soft hyphens so each SHY is its own segment.
    const parts = token.split(SOFT_HYPHEN);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) {
        segments.push(parts[i]);
        widths.push(measure(parts[i]));
      }
      if (i < parts.length - 1) {
        segments.push(SOFT_HYPHEN);
        widths.push(0);
      }
    }
  }
  return { segments, widths };
}

// --- hyphenation (original, generic English morphology) --------------------

function hyphenateWord(word: string): string[] {
  const lower = word.toLowerCase().replace(/[.,;:!?"'—–-]/g, "");
  if (lower.length < 5) return [word];
  const exact = HYPHEN_EXCEPTIONS[lower];
  if (exact !== undefined) {
    const parts: string[] = [];
    let pos = 0;
    for (const part of exact) {
      parts.push(word.slice(pos, pos + part.length));
      pos += part.length;
    }
    if (pos < word.length) parts[parts.length - 1] += word.slice(pos);
    return parts;
  }
  for (const prefix of PREFIXES) {
    if (lower.startsWith(prefix) && lower.length - prefix.length >= 3) {
      return [word.slice(0, prefix.length), word.slice(prefix.length)];
    }
  }
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      const cut = word.length - suffix.length;
      return [word.slice(0, cut), word.slice(cut)];
    }
  }
  return [word];
}

function hyphenateParagraphText(paragraph: string): string {
  const tokens = paragraph.split(/(\s+)/);
  let out = "";
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      out += token;
      continue;
    }
    const parts = hyphenateWord(token);
    out += parts.length <= 1 ? token : parts.join(SOFT_HYPHEN);
  }
  return out;
}

// --- greedy line stepping (stands in for pretext's layoutNextLine) ---------

/** Fill one line greedily from `startSeg`; returns the exclusive end segment index. */
function greedyLineEnd(
  prepared: PreparedParagraph,
  startSeg: number,
  maxWidth: number,
  hyphenWidth: number,
): number {
  const { segments, widths } = prepared;
  const n = segments.length;
  let i = startSeg;
  // Skip leading spaces / SHY at line start.
  while (i < n && (isSpaceText(segments[i]) || segments[i] === SOFT_HYPHEN))
    i++;
  if (i >= n) return n;

  let used = 0;
  let last = i;
  while (i < n) {
    const seg = segments[i];
    if (seg === SOFT_HYPHEN) {
      // A break here would add a trailing hyphen; only take it if the hyphen fits.
      if (used + hyphenWidth <= maxWidth) last = i + 1;
      i++;
      continue;
    }
    const w = widths[i];
    if (!isSpaceText(seg) && used + w > maxWidth && used > 0) {
      // Word overflows — break before it (at the most recent breakable point).
      return last > startSeg ? last : i;
    }
    used += w;
    i++;
    if (!isSpaceText(seg)) last = i;
  }
  return n;
}

function buildLineFromRange(
  prepared: PreparedParagraph,
  from: number,
  to: number,
  maxWidth: number,
  hyphenWidth: number,
  endingKind: BreakCandidateKind,
): MeasuredLine {
  const ending: LineEnding =
    to >= prepared.segments.length ? "paragraph-end" : "wrap";
  let trailingMarker: TrailingMarker = "none";
  const segments: LineSegment[] = [];

  for (let s = from; s < to; s++) {
    const text = prepared.segments[s];
    if (text === SOFT_HYPHEN) {
      if (s === to - 1) trailingMarker = "soft-hyphen";
      continue;
    }
    segments.push(toLineSegment(text, prepared.widths[s]));
  }
  if (
    trailingMarker === "none" &&
    (endingKind === "soft-hyphen" ||
      (to < prepared.segments.length && prepared.segments[to] === SOFT_HYPHEN))
  ) {
    trailingMarker = "soft-hyphen";
  }
  if (trailingMarker === "soft-hyphen" && ending === "wrap") {
    segments.push({ kind: "text", text: "-", width: hyphenWidth });
  }
  trimTrailingSpaces(segments);
  return finalizeMeasuredLine(segments, maxWidth, ending, trailingMarker);
}

function layoutParagraphGreedy(
  prepared: PreparedParagraph,
  maxWidth: number,
  hyphenWidth: number,
): MeasuredLine[] {
  const lines: MeasuredLine[] = [];
  const n = prepared.segments.length;
  let start = 0;
  // Skip any leading spaces.
  while (start < n && isSpaceText(prepared.segments[start])) start++;
  while (start < n) {
    const end = greedyLineEnd(prepared, start, maxWidth, hyphenWidth);
    const kind: BreakCandidateKind =
      end < n && prepared.segments[end - 1] === SOFT_HYPHEN
        ? "soft-hyphen"
        : "space";
    lines.push(
      buildLineFromRange(prepared, start, end, maxWidth, hyphenWidth, kind),
    );
    if (end <= start) break;
    start = end;
  }
  return lines;
}

// --- optimal (Knuth-Plass style DP), ported from pretext verbatim ----------

function layoutParagraphOptimal(
  prepared: PreparedParagraph,
  maxWidth: number,
  hyphenWidth: number,
  normalSpaceWidth: number,
): MeasuredLine[] {
  const { segments, widths } = prepared;
  const segmentCount = segments.length;
  if (segmentCount === 0) return [];

  const breakCandidates: BreakCandidate[] = [{ segIndex: 0, kind: "start" }];
  for (let s = 0; s < segmentCount; s++) {
    const text = segments[s];
    if (text === SOFT_HYPHEN) {
      if (s + 1 < segmentCount)
        breakCandidates.push({ segIndex: s + 1, kind: "soft-hyphen" });
      continue;
    }
    if (isSpaceText(text) && s + 1 < segmentCount) {
      breakCandidates.push({ segIndex: s + 1, kind: "space" });
    }
  }
  breakCandidates.push({ segIndex: segmentCount, kind: "end" });

  const candidateCount = breakCandidates.length;
  const dp: number[] = Array.from({ length: candidateCount }, () => Infinity);
  const previous: number[] = Array.from({ length: candidateCount }, () => -1);
  dp[0] = 0;

  for (let to = 1; to < candidateCount; to++) {
    const isLastLine = breakCandidates[to].kind === "end";
    for (let from = to - 1; from >= 0; from--) {
      if (dp[from] === Infinity) continue;
      const stats = lineStatsFromCandidates(
        segments,
        widths,
        breakCandidates,
        from,
        to,
        hyphenWidth,
        normalSpaceWidth,
      );
      if (stats.naturalWidth > maxWidth * 2) break;
      const total =
        dp[from] + lineBadness(stats, maxWidth, normalSpaceWidth, isLastLine);
      if (total < dp[to]) {
        dp[to] = total;
        previous[to] = from;
      }
    }
  }

  const breakIndices: number[] = [];
  let current = candidateCount - 1;
  while (current > 0) {
    if (previous[current] === -1) {
      current--;
      continue;
    }
    breakIndices.push(current);
    current = previous[current];
  }
  breakIndices.reverse();

  const lines: MeasuredLine[] = [];
  let from = 0;
  for (const to of breakIndices) {
    const fromSeg = breakCandidates[from].segIndex;
    const toSeg = breakCandidates[to].segIndex;
    lines.push(
      buildLineFromRange(
        prepared,
        fromSeg,
        toSeg,
        maxWidth,
        hyphenWidth,
        breakCandidates[to].kind,
      ),
    );
    from = to;
  }
  return lines;
}

function lineStatsFromCandidates(
  segments: readonly string[],
  widths: readonly number[],
  breakCandidates: readonly BreakCandidate[],
  fromCandidate: number,
  toCandidate: number,
  hyphenWidth: number,
  normalSpaceWidth: number,
): LineStats {
  const from = breakCandidates[fromCandidate].segIndex;
  const to = breakCandidates[toCandidate].segIndex;
  const trailingMarker: TrailingMarker =
    breakCandidates[toCandidate].kind === "soft-hyphen"
      ? "soft-hyphen"
      : "none";

  let wordWidth = 0;
  let spaceCount = 0;
  for (let s = from; s < to; s++) {
    const text = segments[s];
    if (text === SOFT_HYPHEN) continue;
    if (isSpaceText(text)) {
      spaceCount++;
      continue;
    }
    wordWidth += widths[s];
  }
  if (to > from && isSpaceText(segments[to - 1])) spaceCount--;
  if (trailingMarker === "soft-hyphen") wordWidth += hyphenWidth;

  return {
    wordWidth,
    spaceCount,
    naturalWidth: wordWidth + spaceCount * normalSpaceWidth,
    trailingMarker,
  };
}

function lineBadness(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
  isLastLine: boolean,
): number {
  if (isLastLine) {
    if (stats.wordWidth > maxWidth) return HUGE_BADNESS;
    return 0;
  }
  if (stats.spaceCount <= 0) {
    const slack = maxWidth - stats.wordWidth;
    if (slack < 0) return HUGE_BADNESS;
    return slack * slack * 10;
  }
  const justifiedSpace = (maxWidth - stats.wordWidth) / stats.spaceCount;
  if (justifiedSpace < 0) return HUGE_BADNESS;
  if (justifiedSpace < normalSpaceWidth * INFEASIBLE_SPACE_RATIO)
    return HUGE_BADNESS;

  const ratio = (justifiedSpace - normalSpaceWidth) / normalSpaceWidth;
  const absRatio = Math.abs(ratio);
  const badness = absRatio * absRatio * absRatio * 1000;

  const riverExcess = justifiedSpace / normalSpaceWidth - RIVER_THRESHOLD;
  const riverPenalty =
    riverExcess > 0 ? 5000 + riverExcess * riverExcess * 10000 : 0;

  const tightThreshold = normalSpaceWidth * TIGHT_SPACE_RATIO;
  const tightPenalty =
    justifiedSpace < tightThreshold
      ? 3000 +
        (tightThreshold - justifiedSpace) *
          (tightThreshold - justifiedSpace) *
          10000
      : 0;

  const hyphenPenalty = stats.trailingMarker === "soft-hyphen" ? 50 : 0;
  return badness + riverPenalty + tightPenalty + hyphenPenalty;
}

// --- shared line finalization + metrics ------------------------------------

function toLineSegment(text: string, width: number): LineSegment {
  if (isSpaceText(text)) return { kind: "space", text, width };
  return { kind: "text", text, width };
}
function trimTrailingSpaces(segments: LineSegment[]): void {
  while (
    segments.length > 0 &&
    segments[segments.length - 1].kind === "space"
  ) {
    segments.pop();
  }
}
function finalizeMeasuredLine(
  segments: LineSegment[],
  maxWidth: number,
  ending: LineEnding,
  trailingMarker: TrailingMarker,
): MeasuredLine {
  let wordWidth = 0;
  let spaceCount = 0;
  let naturalWidth = 0;
  for (const seg of segments) {
    naturalWidth += seg.width;
    if (seg.kind === "space") spaceCount++;
    else wordWidth += seg.width;
  }
  return {
    segments,
    wordWidth,
    spaceCount,
    naturalWidth,
    maxWidth,
    ending,
    trailingMarker,
  };
}

function computeMetrics(
  paragraphs: MeasuredLine[][],
  normalSpaceWidth: number,
): QualityMetrics {
  let totalDeviation = 0;
  let maxDeviation = 0;
  let deviationCount = 0;
  let riverCount = 0;
  let lineCount = 0;
  for (const paragraph of paragraphs) {
    lineCount += paragraph.length;
    for (const line of paragraph) {
      const sw = metricSpaceWidth(line);
      if (sw === null) continue;
      const deviation = Math.abs(sw - normalSpaceWidth) / normalSpaceWidth;
      totalDeviation += deviation;
      if (deviation > maxDeviation) maxDeviation = deviation;
      deviationCount++;
      if (sw > normalSpaceWidth * RIVER_THRESHOLD) riverCount++;
    }
  }
  return {
    avgDeviation: deviationCount > 0 ? totalDeviation / deviationCount : 0,
    maxDeviation,
    riverCount,
    lineCount,
  };
}
function metricSpaceWidth(line: MeasuredLine): number | null {
  if (line.ending === "paragraph-end" || line.spaceCount <= 0) return null;
  return (line.maxWidth - line.wordWidth) / line.spaceCount;
}

function positionColumn(
  colWidth: number,
  paragraphs: MeasuredLine[][],
  normalSpaceWidth: number,
): ColumnFrame {
  let y = PAD;
  const positioned: PositionedLine[][] = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const lines: PositionedLine[] = [];
    for (const line of paragraphs[p]) {
      lines.push({
        ...line,
        y,
        spacing: displaySpacing(line, normalSpaceWidth),
      });
      y += LINE_HEIGHT;
    }
    positioned.push(lines);
    if (p < paragraphs.length - 1) y += PARA_GAP;
  }
  return {
    colWidth,
    totalHeight: y + PAD,
    paragraphs: positioned,
    metrics: computeMetrics(paragraphs, normalSpaceWidth),
  };
}

function displaySpacing(
  line: MeasuredLine,
  normalSpaceWidth: number,
): LineSpacing {
  if (line.ending === "paragraph-end") return { kind: "ragged" };
  if (line.naturalWidth < line.maxWidth * SHORT_LINE_RATIO)
    return { kind: "ragged" };
  if (line.spaceCount <= 0) return { kind: "ragged" };
  const raw = (line.maxWidth - line.wordWidth) / line.spaceCount;
  if (raw < normalSpaceWidth * OVERFLOW_SPACE_RATIO)
    return { kind: "overflow" };
  return {
    kind: "justified",
    width: raw,
    isRiver: raw > normalSpaceWidth * RIVER_THRESHOLD,
  };
}

interface RiverIndicator {
  r: number;
  g: number;
  b: number;
  a: number;
}
function riverIndicator(
  spaceWidth: number,
  normal: number,
): RiverIndicator | null {
  if (spaceWidth <= normal * RIVER_THRESHOLD) return null;
  const intensity = Math.min(
    1,
    (spaceWidth / normal - RIVER_THRESHOLD) / RIVER_THRESHOLD,
  );
  return {
    r: Math.round(220 + intensity * 35),
    g: Math.round(180 - intensity * 80),
    b: Math.round(180 - intensity * 80),
    a: 0.25 + intensity * 0.35,
  };
}

// --- the demo entity -------------------------------------------------------

interface ColumnSpec {
  title: string;
  build: (colWidth: number) => ColumnFrame;
}

const COL_GAP = 20;
const HEADER_H = 92;
const SLIDER_MIN = 200;
const SLIDER_MAX = 420;

class JustificationColumn extends Entity {
  frame: ColumnFrame | null = null;
  private title: string;
  private showRivers: () => boolean;
  private normalSpaceWidth: () => number;

  constructor(
    title: string,
    showRivers: () => boolean,
    normalSpaceWidth: () => number,
  ) {
    super();
    this.title = title;
    this.showRivers = showRivers;
    this.normalSpaceWidth = normalSpaceWidth;
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    if (!this.frame) return;
    const f = this.frame;
    const w = this.width;
    // panel background
    r.beginPath();
    r.roundRect(0, 0, w, this.height, 14);
    r.fill("#ffffff");
    r.stroke(WARM.rule, 1);

    // header: title + metrics
    r.fillText(this.title, PAD, 24, UIFONT.sans(14, 700), WARM.ink);
    const m = f.metrics;
    r.fillText(`${m.lineCount} lines`, PAD, 46, UIFONT.mono(11), WARM.muted);
    r.fillText(
      `avg ${(m.avgDeviation * 100).toFixed(0)}%  max ${(m.maxDeviation * 100).toFixed(0)}%`,
      PAD,
      62,
      UIFONT.mono(11),
      WARM.muted,
    );
    r.fillText(
      `rivers: ${m.riverCount}`,
      PAD,
      78,
      UIFONT.mono(11),
      m.riverCount > 0 ? "#c0392b" : "#2e7d32",
    );

    // text body
    r.save();
    r.beginPath();
    r.roundRect(0, HEADER_H, w, this.height - HEADER_H, 0);
    r.clip(0, HEADER_H, w, this.height - HEADER_H);
    const normal = this.normalSpaceWidth();
    const show = this.showRivers();
    for (const paragraph of f.paragraphs) {
      for (const line of paragraph)
        this.paintLine(r, line, HEADER_H, show, normal);
    }
    r.restore();
  }

  private paintLine(
    r: IRenderer,
    line: PositionedLine,
    yOffset: number,
    showRivers: boolean,
    normal: number,
  ): void {
    let x = PAD;
    const baseline = yOffset + line.y + FONT_SIZE;
    if (line.spacing.kind === "justified") {
      for (const seg of line.segments) {
        if (seg.kind === "space") {
          if (showRivers && line.spacing.isRiver) {
            const ind = riverIndicator(line.spacing.width, normal);
            if (ind) {
              r.beginPath();
              r.roundRect(
                x + 1,
                yOffset + line.y,
                line.spacing.width - 2,
                LINE_HEIGHT,
                0,
              );
              r.fill(`rgba(${ind.r},${ind.g},${ind.b},${ind.a})`);
            }
          }
          x += line.spacing.width;
          continue;
        }
        r.fillText(seg.text, x, baseline, FONT, "#2a2520");
        x += seg.width;
      }
      return;
    }
    // ragged / overflow: natural spacing
    for (const seg of line.segments) {
      if (seg.kind === "space") {
        x += seg.width;
        continue;
      }
      r.fillText(seg.text, x, baseline, FONT, "#2a2520");
      x += seg.width;
    }
  }
}

class JustificationDemo extends Entity {
  private W = 0;
  private H = 0;
  private scrollView: ScrollView;
  private columns: JustificationColumn[] = [];
  private colSpecs: ColumnSpec[];
  private measure: (t: string) => number;
  private normalSpaceWidth: number;
  private hyphenWidth: number;
  private colWidth = 300;
  private showRivers = true;

  // control geometry (header band)
  private sliderX = 0;
  private sliderW = 220;
  private dragging = false;
  private toggleBox = { x: 0, y: 0, w: 150, h: 22 };

  private basePrepared: PreparedParagraph[];
  private hyphenPrepared: PreparedParagraph[];

  constructor() {
    super("JustificationDemo");
    this.measure = makeMeasurer();
    this.normalSpaceWidth = this.measure(" ");
    this.hyphenWidth = this.measure("-");
    this.basePrepared = PARAGRAPHS.map((p) =>
      prepareParagraph(p, this.measure),
    );
    this.hyphenPrepared = PARAGRAPHS.map((p) =>
      prepareParagraph(hyphenateParagraphText(p), this.measure),
    );

    this.colSpecs = [
      {
        title: "CSS greedy (justify)",
        build: (cw) =>
          positionColumn(
            cw,
            this.basePrepared.map((p) =>
              layoutParagraphGreedy(p, cw - PAD * 2, this.hyphenWidth),
            ),
            this.normalSpaceWidth,
          ),
      },
      {
        title: "Greedy + hyphenation",
        build: (cw) =>
          positionColumn(
            cw,
            this.hyphenPrepared.map((p) =>
              layoutParagraphGreedy(p, cw - PAD * 2, this.hyphenWidth),
            ),
            this.normalSpaceWidth,
          ),
      },
      {
        title: "Knuth-Plass optimal",
        build: (cw) =>
          positionColumn(
            cw,
            this.hyphenPrepared.map((p) =>
              layoutParagraphOptimal(
                p,
                cw - PAD * 2,
                this.hyphenWidth,
                this.normalSpaceWidth,
              ),
            ),
            this.normalSpaceWidth,
          ),
      },
    ];

    this.scrollView = new ScrollView({ width: 0, height: 0 });
    this.add(this.scrollView);
    for (const spec of this.colSpecs) {
      const col = new JustificationColumn(
        spec.title,
        () => this.showRivers,
        () => this.normalSpaceWidth,
      );
      this.columns.push(col);
      this.scrollView.add(col);
    }

    this.interactive = true;
    this.on("pointerdown", (e: { localX?: number; localY?: number }) => {
      if (this.inToggle(e.localX, e.localY)) {
        this.showRivers = !this.showRivers;
        this.rebuild();
        return;
      }
      if (this.inSlider(e.localX, e.localY)) {
        this.dragging = true;
        this.updateSlider(e.localX);
      }
    });
    this.on("pointermove", (e: { localX?: number }) => {
      if (this.dragging) this.updateSlider(e.localX);
    });
    this.on("pointerup", () => {
      this.dragging = false;
    });
    this.on("pointerleave", () => {
      this.dragging = false;
    });
  }

  isPointInside(): boolean {
    return true; // owns slider + toggle in the header band
  }

  private inSlider(x?: number, y?: number): boolean {
    if (x === undefined || y === undefined) return false;
    return (
      x >= this.sliderX - 10 &&
      x <= this.sliderX + this.sliderW + 10 &&
      y >= HEADER_TITLE_Y - 16 &&
      y <= HEADER_TITLE_Y + 12
    );
  }
  private inToggle(x?: number, y?: number): boolean {
    if (x === undefined || y === undefined) return false;
    const t = this.toggleBox;
    return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h;
  }
  private updateSlider(x?: number): void {
    if (x === undefined) return;
    const t = Math.max(0, Math.min(1, (x - this.sliderX) / this.sliderW));
    this.colWidth = Math.round(SLIDER_MIN + t * (SLIDER_MAX - SLIDER_MIN));
    this.rebuild();
  }

  private rebuild(): void {
    this.layoutColumns();
    this.scene?.markDirty();
  }

  private layoutColumns(): void {
    // Clamp column width so all three fit the viewport width.
    const avail = this.W - 64;
    const maxCol = Math.floor((avail - COL_GAP * 2) / 3);
    const cw = Math.min(this.colWidth, Math.max(SLIDER_MIN, maxCol));

    let maxH = 0;
    for (let i = 0; i < this.columns.length; i++) {
      const frame = this.colSpecs[i].build(cw);
      const col = this.columns[i];
      col.frame = frame;
      col.width = cw;
      col.height = HEADER_H + frame.totalHeight;
      col.setPosition(i * (cw + COL_GAP), 0);
      if (col.height > maxH) maxH = col.height;
    }
    const totalW =
      this.columns.length * cw + (this.columns.length - 1) * COL_GAP;
    const left = Math.max(0, (this.scrollView.width - totalW) / 2);
    for (let i = 0; i < this.columns.length; i++) {
      this.columns[i].setPosition(left + i * (cw + COL_GAP), 0);
    }
    this.scrollView.content.width = this.scrollView.width;
    this.scrollView.content.height = maxH;
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.scrollView.width = width;
    this.scrollView.height = height - CONTENT_TOP;
    this.scrollView.setPosition(0, CONTENT_TOP);
    this.sliderX = 260;
    this.sliderW = Math.min(200, Math.max(120, width - this.sliderX - 320));
    this.toggleBox = {
      x: this.sliderX + this.sliderW + 40,
      y: HEADER_TITLE_Y - 14,
      w: 150,
      h: 22,
    };
    this.layoutColumns();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(WARM.page);
    drawDemoHeader(
      r,
      32,
      "Rivers of white",
      "Greedy justification vs. a Knuth-Plass optimal pass — watch the rivers close.",
    );

    // width slider
    const trackY = HEADER_TITLE_Y - 4;
    r.beginPath();
    r.roundRect(this.sliderX, trackY - 2, this.sliderW, 4, 2);
    r.fill(WARM.rule);
    const t = (this.colWidth - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
    r.fillCircle(this.sliderX + t * this.sliderW, trackY, 8, WARM.accent);
    r.fillText(
      `Column width: ${this.colWidth}px`,
      this.sliderX,
      trackY - 14,
      UIFONT.sans(12, 600),
      WARM.muted,
    );

    // river toggle
    const tb = this.toggleBox;
    r.beginPath();
    r.roundRect(tb.x, tb.y, 18, 18, 4);
    r.fill(this.showRivers ? WARM.accent : "#ffffff");
    r.stroke(WARM.accentSoft, 1);
    if (this.showRivers) {
      r.fillText("✓", tb.x + 3.5, tb.y + 14, UIFONT.sans(13, 700), "#ffffff");
    }
    r.fillText("Show rivers", tb.x + 26, tb.y + 14, UIFONT.sans(13), WARM.ink);
  }
}

export default JustificationDemo;
