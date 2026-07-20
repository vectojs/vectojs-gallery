/**
 * Editorial Engine — port of pretext's editorial-engine demo.
 *
 * pretext renders a full-viewport editorial article whose body text flows, live
 * and every frame, around several glowing orbs (circular obstacles) that drift
 * and can be dragged, plus a drop cap and two pull-quotes — a stress test of
 * per-frame obstacle-routed layout with zero DOM measurement.
 *
 * This port keeps that mechanic on VectoJS's canvas measurement: a drifting,
 * draggable orb field (circle obstacles), a drop cap, two pull-quotes (rect
 * obstacles), and a continuous body that relays out every frame the orbs move.
 * The body copy is original VectoJS-pitch prose (the pretext original uses its
 * own manifesto here); the structure and length match so the layout stress is
 * equivalent.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { DARK } from "../shared/theme";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";
import {
  makeFlowMeasurer,
  prepareFlow,
  layoutNextFlowLine,
  type PreparedFlow,
} from "../shared/text-flow";
import {
  carveTextLineSlots,
  circleIntervalForBand,
  rectIntervalsForBand,
  type Interval,
  type Rect,
} from "../shared/wrap-geometry";

const BODY_FONT = '17px Georgia, "Times New Roman", serif';
const BODY_LINE_HEIGHT = 27;
const HEADLINE_FAMILY = 'Georgia, "Times New Roman", serif';
const HEADLINE_TEXT = "THE FUTURE OF TEXT LAYOUT IS CANVAS";
const PQ_FONT = 'italic 18px Georgia, "Times New Roman", serif';
const PQ_LINE_HEIGHT = 26;
const MIN_SLOT = 60;

const BODY_TEXT =
  "For thirty years the browser has been the gatekeeper of everything text knows about itself. If you wanted a width, a height, a line count, you asked the layout tree, and the layout tree answered only after a synchronous reflow that could freeze the main thread. That toll was invisible for a paragraph in an article and ruinous for an application, where knowing the size of text is the first step of nearly every interesting layout. " +
  "A chat window needs the exact height of a bubble before it can virtualize a list. A masonry wall needs the height of a card before it can place it. An editorial page needs text to move around images and quotations. A dashboard needs to reflow the instant a panel is dragged. Every one of these is a text measurement, and on the traditional web every text measurement is a reflow. Measure five hundred blocks and you have paid for five hundred full layout passes. " +
  "VectoJS starts from a different place. There is no document to reflow, because nothing is laid out in the DOM at all. Text is measured once on the canvas, and from then on a line is arithmetic: walk the cached widths, track the running total, break when it overflows, sum the heights. The answer costs microseconds and it costs the same whether the page holds ten elements or ten thousand. " +
  "Once measurement is free, a whole category of interface that used to be too expensive becomes ordinary. Text can wrap around any shape, because you control the width of every line directly: compute which horizontal spans an obstacle blocks on this band, subtract them, and hand the engine what remains. The obstacles can be rectangles, circles, or arbitrary polygons, and they can move, because a reflow that costs nothing can happen on every frame. " +
  "The glowing orbs drifting through this article are not decoration; they are the demonstration. Each one is a circular obstacle. For every line, the engine asks whether the line's band crosses the orb, and if it does it removes the blocked span and flows the remaining text on both sides at once — something the old CSS shape features could never do. Grab an orb and drag it, and the paragraphs part around your cursor in real time. " +
  "Shrinkwrap is the same idea pointed inward: given a block of text, what is the narrowest width that keeps the current number of lines? A binary search over widths finds it, and the result is the tightest honest bounding box — exactly what a message bubble or a caption wants. Virtualization becomes exact rather than estimated, because the height of a row is known before the row is ever built, so nothing jumps as you scroll. " +
  "Multi-column flow with a handoff cursor is the most quietly satisfying of all. The first column fills until it runs out of room and passes its cursor to the second, which resumes at the precise grapheme where the first stopped. No duplicated words, no gap, no hidden overflow hacks — just the way a newspaper has always worked, finally cheap enough for the web. " +
  "None of this needs a new browser feature or a standards process. It needs measurement that does not cost a reflow, cached metrics, and the willingness to stop asking the DOM. The open web deserves typography as ambitious as everything else it does. This is what changes when text measurement is free: not a little better, but a different kind of thing entirely — the text that sat in boxes begins to flow.";

const PULLQUOTES = [
  "\u201cMeasurement that costs a microsecond changes what an interface can be, not just how fast it runs.\u201d",
  "\u201cThe obstacles can move, because a reflow that costs nothing can happen on every single frame.\u201d",
];

interface OrbDef {
  fx: number;
  fy: number;
  r: number;
  vx: number;
  vy: number;
  color: [number, number, number];
}
interface Orb {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}
const ORB_DEFS: OrbDef[] = [
  { fx: 0.5, fy: 0.24, r: 92, vx: 22, vy: 15, color: [196, 163, 90] },
  { fx: 0.2, fy: 0.5, r: 72, vx: -17, vy: 24, color: [100, 140, 255] },
  { fx: 0.74, fy: 0.6, r: 82, vx: 15, vy: -19, color: [232, 100, 130] },
  { fx: 0.4, fy: 0.76, r: 64, vx: -22, vy: -12, color: [80, 200, 140] },
  { fx: 0.85, fy: 0.2, r: 56, vx: -11, vy: 17, color: [150, 100, 220] },
];

interface PositionedLine {
  x: number;
  y: number;
  text: string;
}
interface PullquoteBox {
  rect: Rect;
  lines: PositionedLine[];
}

class EditorialEngineDemo extends Entity {
  private W = 0;
  private H = 0;
  private measure: (t: string) => number;
  private preparedBody: PreparedFlow;
  private preparedPQ: PreparedFlow[];
  private orbs: Orb[] = [];
  private lines: PositionedLine[] = [];
  private headlineLines: PositionedLine[] = [];
  private headlineFontSize = 40;
  private pullquotes: PullquoteBox[] = [];
  private dropCap = "";
  private dropCapFontSize = 0;
  private dropCapX = 0;
  private dropCapY = 0;
  private dragOrb = -1;
  private dragDX = 0;
  private dragDY = 0;
  private lastTime = 0;

  constructor() {
    super("EditorialEngineDemo");
    this.measure = makeFlowMeasurer(BODY_FONT);
    this.dropCap = BODY_TEXT[0];
    this.preparedBody = prepareFlow(BODY_TEXT.slice(1), this.measure);
    const pqMeasure = makeFlowMeasurer(PQ_FONT);
    this.preparedPQ = PULLQUOTES.map((t) => prepareFlow(t, pqMeasure));

    this.interactive = true;
    this.on("pointerdown", (e: { localX?: number; localY?: number }) => {
      if (e.localX === undefined || e.localY === undefined) return;
      for (let i = 0; i < this.orbs.length; i++) {
        const o = this.orbs[i];
        if (Math.hypot(e.localX - o.x, e.localY - o.y) <= o.r) {
          this.dragOrb = i;
          this.dragDX = o.x - e.localX;
          this.dragDY = o.y - e.localY;
          return;
        }
      }
    });
    this.on("pointermove", (e: { localX?: number; localY?: number }) => {
      if (this.dragOrb < 0 || e.localX === undefined || e.localY === undefined)
        return;
      const o = this.orbs[this.dragOrb];
      o.x = e.localX + this.dragDX;
      o.y = e.localY + this.dragDY;
      o.vx = 0;
      o.vy = 0;
      this.relayout();
      this.scene?.markDirty();
    });
    const end = () => {
      if (this.dragOrb >= 0) {
        // Restore drift so a released orb resumes floating instead of freezing
        // (its velocity was zeroed while dragged). Reuse the seed speed with a
        // random direction so each release feels lively.
        const o = this.orbs[this.dragOrb];
        const def = ORB_DEFS[this.dragOrb];
        const speed = Math.hypot(def.vx, def.vy);
        const a = Math.random() * Math.PI * 2;
        o.vx = Math.cos(a) * speed;
        o.vy = Math.sin(a) * speed;
      }
      this.dragOrb = -1;
    };
    this.on("pointerup", end);
    this.on("pointerleave", end);
  }

  isPointInside(): boolean {
    return true;
  }
  hasPendingAnimations(): boolean {
    return true;
  }

  private initOrbs(): void {
    this.orbs = ORB_DEFS.map((d) => ({
      x: d.fx * this.W,
      y: CONTENT_TOP + d.fy * (this.H - CONTENT_TOP),
      r: d.r,
      vx: d.vx,
      vy: d.vy,
    }));
  }

  update(dt: number, time: number): void {
    super.update(dt, time);
    const dtSec =
      this.lastTime === 0
        ? 0.016
        : Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    const top = CONTENT_TOP + 4;
    const bottom = this.H - 12;
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      if (i === this.dragOrb) continue;
      o.x += o.vx * dtSec;
      o.y += o.vy * dtSec;
      if (o.x - o.r < 0) {
        o.x = o.r;
        o.vx = Math.abs(o.vx);
      }
      if (o.x + o.r > this.W) {
        o.x = this.W - o.r;
        o.vx = -Math.abs(o.vx);
      }
      if (o.y - o.r < top) {
        o.y = top + o.r;
        o.vy = Math.abs(o.vy);
      }
      if (o.y + o.r > bottom) {
        o.y = bottom - o.r;
        o.vy = -Math.abs(o.vy);
      }
    }
    this.relayout();
    this.scene?.markDirty();
  }

  private orbIntervals(bandTop: number, bandBottom: number): Interval[] {
    const blocked: Interval[] = [];
    for (const o of this.orbs) {
      const iv = circleIntervalForBand(
        o.x,
        o.y,
        o.r,
        bandTop,
        bandBottom,
        16,
        6,
      );
      if (iv) blocked.push(iv);
    }
    return blocked;
  }

  private relayout(): void {
    if (this.W === 0) return;
    this.lines = [];
    const gutter = Math.max(40, this.W * 0.05);
    const colGap = Math.max(36, this.W * 0.035);
    const pageTop = CONTENT_TOP + 8;
    const pageBottom = this.H - 20;
    const narrow = this.W < 780;

    // headline
    const headlineWidth = this.W - gutter * 2;
    this.headlineFontSize = this.fitHeadline(headlineWidth);
    const headlineFont = `700 ${this.headlineFontSize}px ${HEADLINE_FAMILY}`;
    const headlineLH = Math.round(this.headlineFontSize * 1.05);
    const hp = prepareFlow(HEADLINE_TEXT, makeFlowMeasurer(headlineFont));
    this.headlineLines = [];
    {
      let seg = 0;
      let top = pageTop;
      while (seg < hp.segments.length) {
        const line = layoutNextFlowLine(hp, seg, headlineWidth);
        if (!line) break;
        this.headlineLines.push({ x: gutter, y: top, text: line.text });
        seg = line.endSeg;
        top += headlineLH;
      }
    }
    const bodyTop =
      (this.headlineLines.length
        ? this.headlineLines[this.headlineLines.length - 1].y + headlineLH
        : pageTop) + 18;

    // pull-quote boxes (rect obstacles), placed relative to columns
    const colWidth = narrow
      ? this.W - gutter * 2
      : (this.W - gutter * 2 - colGap) / 2;
    this.pullquotes = [];
    const pqPlacements = narrow
      ? [{ x: gutter, yFrac: 0.5, w: colWidth }]
      : [
          { x: gutter + colWidth * 0.42, yFrac: 0.5, w: colWidth * 0.62 },
          { x: gutter + colWidth + colGap, yFrac: 0.34, w: colWidth * 0.6 },
        ];
    for (
      let i = 0;
      i < pqPlacements.length && i < this.preparedPQ.length;
      i++
    ) {
      const pl = pqPlacements[i];
      const y = bodyTop + pl.yFrac * (pageBottom - bodyTop);
      const box = this.layoutPullquote(this.preparedPQ[i], pl.x, y, pl.w);
      this.pullquotes.push(box);
    }
    const pqRects = this.pullquotes.map((p) => p.rect);

    // drop cap size + anchor (at the gutter, top of the body) so the glyph is
    // drawn where its obstacle rect actually reserves space — not at the
    // indented first body line.
    this.dropCapFontSize = BODY_LINE_HEIGHT * 3 - 6;
    const dropCapMeasure = makeFlowMeasurer(
      `700 ${this.dropCapFontSize}px ${HEADLINE_FAMILY}`,
    );
    const dropCapW = dropCapMeasure(this.dropCap) + 10;
    this.dropCapX = gutter;
    this.dropCapY = bodyTop;
    const dropCapRect: Rect = {
      x: gutter,
      y: bodyTop,
      width: dropCapW,
      height: BODY_LINE_HEIGHT * 3,
    };

    if (narrow) {
      const region: Rect = {
        x: gutter,
        y: bodyTop,
        width: colWidth,
        height: pageBottom - bodyTop,
      };
      this.flowColumn(region, 0, [...pqRects, dropCapRect]);
      return;
    }

    const leftRegion: Rect = {
      x: gutter,
      y: bodyTop,
      width: colWidth,
      height: pageBottom - bodyTop,
    };
    const rightRegion: Rect = {
      x: gutter + colWidth + colGap,
      y: bodyTop,
      width: colWidth,
      height: pageBottom - bodyTop,
    };
    const cursor = this.flowColumn(leftRegion, 0, [...pqRects, dropCapRect]);
    this.flowColumn(rightRegion, cursor, pqRects);
  }

  private layoutPullquote(
    prepared: PreparedFlow,
    x: number,
    y: number,
    w: number,
  ): PullquoteBox {
    const lines: PositionedLine[] = [];
    let seg = 0;
    let top = y;
    while (seg < prepared.segments.length) {
      const line = layoutNextFlowLine(prepared, seg, w);
      if (!line) break;
      lines.push({ x, y: top, text: line.text });
      seg = line.endSeg;
      top += PQ_LINE_HEIGHT;
    }
    return {
      rect: {
        x,
        y: y - 6,
        width: w,
        height: lines.length * PQ_LINE_HEIGHT + 12,
      },
      lines,
    };
  }

  private flowColumn(
    region: Rect,
    startSeg: number,
    extraRects: Rect[],
  ): number {
    let seg = startSeg;
    let top = region.y;
    while (top + BODY_LINE_HEIGHT <= region.y + region.height) {
      const bandTop = top;
      const bandBottom = top + BODY_LINE_HEIGHT;
      const blocked = this.orbIntervals(bandTop, bandBottom);
      for (const iv of rectIntervalsForBand(
        extraRects,
        bandTop,
        bandBottom,
        14,
        4,
      )) {
        blocked.push(iv);
      }
      const slots = carveTextLineSlots(
        { left: region.x, right: region.x + region.width },
        blocked,
        MIN_SLOT,
      );
      if (slots.length === 0) {
        top += BODY_LINE_HEIGHT;
        continue;
      }
      let slot = slots[0];
      for (let i = 1; i < slots.length; i++) {
        if (slots[i].right - slots[i].left > slot.right - slot.left)
          slot = slots[i];
      }
      const line = layoutNextFlowLine(
        this.preparedBody,
        seg,
        slot.right - slot.left,
      );
      if (!line) break;
      this.lines.push({
        x: Math.round(slot.left),
        y: Math.round(top),
        text: line.text,
      });
      seg = line.endSeg;
      top += BODY_LINE_HEIGHT;
      if (seg >= this.preparedBody.segments.length) break;
    }
    return seg;
  }

  private fitHeadline(maxWidth: number): number {
    let lo = 22;
    let hi = Math.min(60, Math.max(30, this.W * 0.045));
    let best = lo;
    const words = HEADLINE_TEXT.split(/\s+/);
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const measure = makeFlowMeasurer(`700 ${mid}px ${HEADLINE_FAMILY}`);
      if (words.every((w) => measure(w) <= maxWidth)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.initOrbs();
    this.relayout();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(DARK.page);

    // orbs (soft glow via layered translucent circles)
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      const c = ORB_DEFS[i].color;
      r.fillCircle(o.x, o.y, o.r, `rgb(${c[0]},${c[1]},${c[2]})`, 0.1);
      r.fillCircle(o.x, o.y, o.r * 0.7, `rgb(${c[0]},${c[1]},${c[2]})`, 0.14);
      r.fillCircle(o.x, o.y, o.r * 0.4, `rgb(${c[0]},${c[1]},${c[2]})`, 0.2);
    }

    drawDemoHeader(
      r,
      32,
      "Editorial engine",
      "Body text reflows around drifting orbs every frame — drag one and the columns part live.",
      true,
    );

    // headline
    for (const l of this.headlineLines) {
      r.fillText(
        l.text,
        l.x,
        l.y + this.headlineFontSize * 0.82,
        `700 ${this.headlineFontSize}px ${HEADLINE_FAMILY}`,
        DARK.ink,
      );
    }

    // drop cap (drawn at its reserved gutter anchor, not the indented body)
    if (this.lines.length > 0) {
      r.fillText(
        this.dropCap,
        this.dropCapX,
        this.dropCapY + this.dropCapFontSize * 0.82,
        `700 ${this.dropCapFontSize}px ${HEADLINE_FAMILY}`,
        DARK.accentSoft,
      );
    }

    // body
    for (const l of this.lines) {
      r.fillText(
        l.text,
        l.x,
        l.y + BODY_LINE_HEIGHT * 0.72,
        BODY_FONT,
        DARK.muted,
      );
    }

    // pull-quotes
    for (const pq of this.pullquotes) {
      r.beginPath();
      r.roundRect(pq.rect.x - 6, pq.rect.y, 3, pq.rect.height, 1.5);
      r.fill(DARK.accent);
      for (const l of pq.lines) {
        r.fillText(
          l.text,
          l.x + 6,
          l.y + PQ_LINE_HEIGHT * 0.72,
          PQ_FONT,
          DARK.ink,
        );
      }
    }
  }
}

export default EditorialEngineDemo;
