/**
 * Dynamic Layout — port of pretext's dynamic-layout demo.
 *
 * pretext lays out a fixed-height editorial spread whose title and two body
 * columns route around logo shapes, with the body as one continuous stream
 * handed from the left column to the right, and click-to-rotate obstacles that
 * reflow the text live. All line breaking is done by its layout engine, never
 * DOM flow.
 *
 * This port keeps the mechanic on VectoJS's canvas measurement (shared
 * `text-flow` + `wrap-geometry`): a fit-to-width headline, a continuous body
 * stream flowing left-column-then-right-column, both routing around two
 * abstract polygon obstacles, click-to-rotate with instant reflow. The copy is
 * original (VectoJS-themed) and the obstacles are abstract shapes, not the
 * trademarked logos the original happens to use.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { DARK } from "../shared/theme";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";
import { LinePool, type PooledLine } from "../shared/LinePool";
import {
  makeFlowMeasurer,
  prepareFlow,
  layoutNextFlowLine,
  type PreparedFlow,
} from "../shared/text-flow";
import {
  carveTextLineSlots,
  polygonIntervalForBand,
  rectIntervalsForBand,
  transformWrapPoints,
  isPointInPolygon,
  regularPolygonHull,
  type Interval,
  type Point,
  type Rect,
} from "../shared/wrap-geometry";

const BODY_FONT = '18px Georgia, "Times New Roman", serif';
const BODY_LINE_HEIGHT = 28;
const HEADLINE_FAMILY = 'Georgia, "Times New Roman", serif';
const HEADLINE_TEXT = "TYPE THAT FLOWS AROUND ANYTHING";
const CREDIT_TEXT = "A VectoJS layout study";
const CREDIT_FONT = '12px "Helvetica Neue", Helvetica, Arial, sans-serif';

const BODY_COPY =
  "A page is not a stack of rectangles. On paper, text has always known how to move — around a photograph, past a dropped initial, along the curve of an illustration — because a compositor could see the whole spread at once and place every line by hand. The web forgot this. Its text sits in boxes because measuring text used to mean asking the browser, and the browser made you pay for every answer with a reflow. " +
  "VectoJS measures text on the canvas instead. Every word is measured once, and after that a line of type is pure arithmetic: take the horizontal room available on this band, subtract whatever shapes intrude on it, and hand the remaining width to the layout engine. The engine returns exactly the text that fits, and the next line resumes from precisely where this one stopped. " +
  "Because the shapes are just numbers, they can move. Click one of the marks on this spread and it spins; the text closes in behind it and opens ahead of it, every frame, with no layout pass and no jump. The left column fills first and hands its cursor to the right column, so the body reads as one continuous stream broken across two measures — the way a newspaper reads, and the way the web never quite managed. " +
  "This is the plain version of an idea that sounds exotic: text as a fluid material rather than a static block. Nothing here is expensive. The whole spread relays out in well under a millisecond, which is why it can happen live while you drag a browser edge or send a shape spinning through the column.";

type ObstacleKind = "poly-a" | "poly-b";
interface Obstacle {
  kind: ObstacleKind;
  rect: Rect;
  baseHull: Point[];
  angle: number;
  spinFrom: number;
  spinTo: number;
  spinStart: number;
  color: string;
}

interface PositionedLine {
  x: number;
  y: number;
  text: string;
  font: string;
  color: string;
}

const SPIN_DURATION = 800;

class DynamicLayoutDemo extends Entity {
  private W = 0;
  private H = 0;
  private measure: (t: string) => number;
  private preparedBody: PreparedFlow;
  private obstacles: Obstacle[];
  private lines: PositionedLine[] = [];
  private headlineLines: PositionedLine[] = [];
  private creditLine: PositionedLine | null = null;
  private anySpinning = false;
  // Selectable text is projected through pooled Text entities (raw fillText
  // projects nothing selectable); chrome + obstacles stay on the canvas.
  private textPool = new LinePool("DynamicLayoutText");

  constructor() {
    super("DynamicLayoutDemo");
    this.measure = makeFlowMeasurer(BODY_FONT);
    this.preparedBody = prepareFlow(BODY_COPY, this.measure);
    this.add(this.textPool);
    this.obstacles = [
      {
        kind: "poly-a",
        rect: { x: 0, y: 0, width: 0, height: 0 },
        baseHull: regularPolygonHull(6, Math.PI / 6),
        angle: 0,
        spinFrom: 0,
        spinTo: 0,
        spinStart: -1,
        color: "rgba(124,92,255,0.22)",
      },
      {
        kind: "poly-b",
        rect: { x: 0, y: 0, width: 0, height: 0 },
        baseHull: regularPolygonHull(3, -Math.PI / 2),
        angle: 0,
        spinFrom: 0,
        spinTo: 0,
        spinStart: -1,
        color: "rgba(34,211,238,0.20)",
      },
    ];

    this.interactive = true;
    this.on("pointerdown", (e: { localX?: number; localY?: number }) => {
      this.handleClick(e.localX, e.localY);
    });
  }

  isPointInside(): boolean {
    return true;
  }

  hasPendingAnimations(): boolean {
    return this.anySpinning;
  }

  private hullOf(o: Obstacle): Point[] {
    return transformWrapPoints(o.baseHull, o.rect, o.angle);
  }

  private handleClick(x?: number, y?: number): void {
    if (x === undefined || y === undefined) return;
    for (const o of this.obstacles) {
      if (isPointInPolygon(this.hullOf(o), x, y)) {
        o.spinFrom = o.angle;
        o.spinTo = o.angle + Math.PI * (o.kind === "poly-a" ? 1 : -1);
        o.spinStart = performance.now();
        this.anySpinning = true;
        this.scene?.markDirty();
        return;
      }
    }
  }

  update(dt: number, time: number): void {
    super.update(dt, time);
    if (!this.anySpinning) return;
    const now = performance.now();
    let stillSpinning = false;
    for (const o of this.obstacles) {
      if (o.spinStart < 0) continue;
      const t = Math.min(1, (now - o.spinStart) / SPIN_DURATION);
      const ease = 1 - (1 - t) ** 3;
      o.angle = o.spinFrom + (o.spinTo - o.spinFrom) * ease;
      if (t >= 1) o.spinStart = -1;
      else stillSpinning = true;
    }
    this.anySpinning = stillSpinning;
    this.relayout();
    this.scene?.markDirty();
  }

  private obstacleIntervals(
    bandTop: number,
    bandBottom: number,
    hPad: number,
    vPad: number,
  ): Interval[] {
    const blocked: Interval[] = [];
    for (const o of this.obstacles) {
      const iv = polygonIntervalForBand(
        this.hullOf(o),
        bandTop,
        bandBottom,
        hPad,
        vPad,
      );
      if (iv) blocked.push(iv);
    }
    return blocked;
  }

  /** Flow one column region, routing around obstacles + optional extra rects. */
  private flowColumn(
    region: Rect,
    startSeg: number,
    side: "left" | "right",
    extraRects: Rect[],
    lineHeight: number,
    font: string,
    color: string,
    out: PositionedLine[],
  ): number {
    let seg = startSeg;
    let top = region.y;
    while (top + lineHeight <= region.y + region.height) {
      const bandTop = top;
      const bandBottom = top + lineHeight;
      const blocked = this.obstacleIntervals(
        bandTop,
        bandBottom,
        Math.round(lineHeight * 0.8),
        Math.round(lineHeight * 0.25),
      );
      for (const iv of rectIntervalsForBand(
        extraRects,
        bandTop,
        bandBottom,
        lineHeight * 0.9,
        lineHeight * 0.3,
      )) {
        blocked.push(iv);
      }
      const slots = carveTextLineSlots(
        { left: region.x, right: region.x + region.width },
        blocked,
      );
      if (slots.length === 0) {
        top += lineHeight;
        continue;
      }
      // widest slot; tie-break by side
      let slot = slots[0];
      for (let i = 1; i < slots.length; i++) {
        const c = slots[i];
        const bw = slot.right - slot.left;
        const cw = c.right - c.left;
        if (
          cw > bw ||
          (cw === bw &&
            (side === "left" ? c.left > slot.left : c.left < slot.left))
        ) {
          slot = c;
        }
      }
      const line = layoutNextFlowLine(
        this.preparedBody,
        seg,
        slot.right - slot.left,
      );
      if (!line) break;
      out.push({
        x: Math.round(slot.left),
        y: Math.round(top),
        text: line.text,
        font,
        color,
      });
      seg = line.endSeg;
      top += lineHeight;
      if (seg >= this.preparedBody.segments.length) break;
    }
    return seg;
  }

  private relayout(): void {
    this.lines = [];
    this.headlineLines = [];

    const pageTop = CONTENT_TOP + 8;
    const gutter = Math.max(36, this.W * 0.045);
    const centerGap = Math.max(28, this.W * 0.03);
    const narrow = this.W < 780;
    const pageBottom = this.H - 24;

    // position the two obstacles
    const sizeA = Math.min(240, this.W * 0.24, (pageBottom - pageTop) * 0.5);
    const sizeB = Math.min(180, this.W * 0.18, (pageBottom - pageTop) * 0.4);
    this.obstacles[0].rect = {
      x: gutter - sizeA * 0.15,
      y: pageBottom - sizeA - 10,
      width: sizeA,
      height: sizeA,
    };
    this.obstacles[1].rect = {
      x: this.W - gutter - sizeB * 0.75,
      y: pageTop - sizeB * 0.12,
      width: sizeB,
      height: sizeB,
    };

    // headline: fit font size so no word breaks, routing around obstacle A
    const headlineWidth = Math.min(
      this.W - gutter * 2,
      Math.max(this.W * 0.5, 360),
    );
    const headlineFontSize = this.fitHeadline(headlineWidth);
    const headlineFont = `700 ${headlineFontSize}px ${HEADLINE_FAMILY}`;
    const headlineLH = Math.round(headlineFontSize * 1.02);
    const headlinePrepared = prepareFlow(
      HEADLINE_TEXT,
      makeFlowMeasurer(headlineFont),
    );
    {
      let seg = 0;
      let top = pageTop;
      while (
        seg < headlinePrepared.segments.length &&
        top + headlineLH <= pageBottom
      ) {
        const blocked = this.obstacleIntervals(
          top,
          top + headlineLH,
          headlineLH * 0.3,
          headlineLH * 0.1,
        );
        const slots = carveTextLineSlots(
          { left: gutter, right: gutter + headlineWidth },
          blocked,
        );
        const slot = slots.length
          ? slots.reduce((a, b) =>
              b.right - b.left > a.right - a.left ? b : a,
            )
          : null;
        if (!slot) {
          top += headlineLH;
          continue;
        }
        const line = layoutNextFlowLine(
          headlinePrepared,
          seg,
          slot.right - slot.left,
        );
        if (!line) break;
        this.headlineLines.push({
          x: Math.round(slot.left),
          y: Math.round(top),
          text: line.text,
          font: headlineFont,
          color: DARK.ink,
        });
        seg = line.endSeg;
        top += headlineLH;
      }
    }
    const headlineBottom =
      this.headlineLines.length > 0
        ? this.headlineLines[this.headlineLines.length - 1].y + headlineLH
        : pageTop;

    // credit
    const creditTop = headlineBottom + 14;
    this.creditLine = {
      x: Math.round(gutter),
      y: creditTop,
      text: CREDIT_TEXT,
      font: CREDIT_FONT,
      color: DARK.accentSoft,
    };

    const copyTop = creditTop + 28;
    const headlineRects: Rect[] = this.headlineLines.map((l) => ({
      x: l.x,
      y: l.y,
      width: this.measure(l.text) + 20,
      height: headlineLH,
    }));

    if (narrow) {
      const region: Rect = {
        x: gutter,
        y: copyTop,
        width: this.W - gutter * 2,
        height: pageBottom - copyTop,
      };
      this.flowColumn(
        region,
        0,
        "left",
        headlineRects,
        BODY_LINE_HEIGHT,
        BODY_FONT,
        DARK.muted,
        this.lines,
      );
      this.syncTextPool();
      return;
    }

    const colWidth = (this.W - gutter * 2 - centerGap) / 2;
    const leftRegion: Rect = {
      x: gutter,
      y: copyTop,
      width: colWidth,
      height: pageBottom - copyTop,
    };
    const rightRegion: Rect = {
      x: gutter + colWidth + centerGap,
      y: pageTop,
      width: colWidth,
      height: pageBottom - pageTop,
    };
    const cursor = this.flowColumn(
      leftRegion,
      0,
      "left",
      [],
      BODY_LINE_HEIGHT,
      BODY_FONT,
      DARK.muted,
      this.lines,
    );
    this.flowColumn(
      rightRegion,
      cursor,
      "right",
      headlineRects,
      BODY_LINE_HEIGHT,
      BODY_FONT,
      DARK.muted,
      this.lines,
    );
    this.syncTextPool();
  }

  /**
   * Push headline + credit + body lines into the selectable Text pool. Each
   * pooled line's `lineHeight` is set to its own font size so the Text
   * baseline (0.8×lineHeight) lands where the canvas layout expects it.
   */
  private syncTextPool(): void {
    const pooled: PooledLine[] = [];
    const headlineFontSize = this.headlineLines.length
      ? parseInt(this.headlineLines[0].font.match(/(\d+)px/)?.[1] ?? "40", 10)
      : 40;
    for (const l of this.headlineLines) {
      pooled.push({
        x: l.x,
        y: l.y,
        text: l.text,
        font: l.font,
        color: l.color,
        lineHeight: headlineFontSize * 1.02,
      });
    }
    if (this.creditLine) {
      pooled.push({
        x: this.creditLine.x,
        y: this.creditLine.y - 12,
        text: this.creditLine.text,
        font: this.creditLine.font,
        color: this.creditLine.color,
        lineHeight: 16,
      });
    }
    for (const l of this.lines) {
      pooled.push({
        x: l.x,
        y: l.y,
        text: l.text,
        font: l.font,
        color: l.color,
        lineHeight: BODY_LINE_HEIGHT,
      });
    }
    this.textPool.setLines(pooled);
  }

  private fitHeadline(maxWidth: number): number {
    let lo = 24;
    let hi = Math.min(72, Math.max(34, this.W * 0.05));
    let best = lo;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const font = `700 ${mid}px ${HEADLINE_FAMILY}`;
      const measure = makeFlowMeasurer(font);
      // no word may exceed the width
      const words = HEADLINE_TEXT.split(/\s+/);
      const fits = words.every((w) => measure(w) <= maxWidth);
      if (fits) {
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
    this.relayout();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(DARK.page);
    drawDemoHeader(
      r,
      32,
      "Type that flows",
      "One continuous stream across two columns, routing around shapes you can click to spin.",
      true,
    );

    // obstacles
    for (const o of this.obstacles) {
      const hull = this.hullOf(o);
      if (hull.length === 0) continue;
      r.beginPath();
      r.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) r.lineTo(hull[i].x, hull[i].y);
      r.lineTo(hull[0].x, hull[0].y);
      r.fill(o.color);
      r.stroke(o.color.replace(/0\.\d+\)/, "0.6)"), 1.5);
    }

    // Headline, credit, and body text are projected by the selectable Text
    // pool (see syncTextPool) — not painted here — so the browser can select
    // and copy them. Only the chrome + obstacles draw on the canvas.
  }
}

export default DynamicLayoutDemo;
