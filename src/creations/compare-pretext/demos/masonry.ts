/**
 * Masonry — port of pretext's masonry demo.
 *
 * pretext's version measures every card's exact text height ahead of time
 * (`prepare()` + `layout()`) so a Pinterest-style column-packing layout can
 * place all ~1,600 cards in one O(n) pass, then virtualizes by adding/
 * removing DOM nodes for only the cards inside the scrolled viewport
 * (+200px overscan) — proving height prediction without ever rendering a
 * card off-screen first. This port keeps that exact virtualization
 * contract on VectoJS's own `LayoutEngine`: card entities inside the
 * viewport are mounted as real children of `ScrollView.content`; cards that
 * scroll away are unmounted, not just hidden.
 */
import { Entity, LayoutEngine, type IRenderer } from "@vectojs/core";
import { ScrollView, Text } from "@vectojs/ui";
import { WARM, FONT } from "../shared/theme";
import { fontMeasurer } from "../shared/measure";
import { CONTENT_TOP, HEADER_TITLE_Y, drawDemoHeader } from "../shared/chrome";
import { MASONRY_QUIPS } from "./masonry-data";

const CARD_FONT_SIZE = 14;
const CARD_LINE_HEIGHT = 21;
const CARD_FONT = FONT.sans(14);
const CARD_PADDING = 16;
const GAP = 12;
const MAX_COL_WIDTH = 400;
const SINGLE_COL_MAX_VIEWPORT = 520;
const OVERSCAN = 200;

interface PositionedCard {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

class MasonryCard extends Entity {
  private text: Text;

  constructor(quip: string, width: number) {
    super();
    this.text = new Text(quip, {
      font: CARD_FONT,
      color: WARM.ink,
      lineHeight: CARD_LINE_HEIGHT,
      maxWidth: width - CARD_PADDING * 2,
    });
    this.text.setPosition(CARD_PADDING, CARD_PADDING);
    this.add(this.text);
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 10);
    r.fill("#ffffff");
    r.stroke("rgba(0,0,0,0.06)", 1);
  }
}

class MasonryDemo extends Entity {
  private W = 0;
  private H = 0;
  private scrollView: ScrollView;
  private engine: LayoutEngine;

  // Full-dataset layout, computed once per width change (mirrors pretext's
  // "recompute all card positions on every resize" contract).
  private positioned: PositionedCard[] = [];
  private colWidth = 0;
  private contentHeight = 0;

  // Virtualization: index -> mounted card entity, only for cards currently
  // inside [scrollTop - OVERSCAN, scrollTop + viewportH + OVERSCAN].
  private mounted = new Map<number, MasonryCard>();
  private lastScrollTop = -1;

  constructor() {
    super("MasonryDemo");
    this.engine = new LayoutEngine(1e9, 1e9, fontMeasurer(CARD_FONT));
    this.scrollView = new ScrollView({ width: 0, height: 0 });
    this.add(this.scrollView);
  }

  isPointInside(): boolean {
    return false;
  }

  private computeLayout(viewportWidth: number): void {
    let colCount: number;
    let colWidth: number;
    if (viewportWidth <= SINGLE_COL_MAX_VIEWPORT) {
      colCount = 1;
      colWidth = Math.min(MAX_COL_WIDTH, viewportWidth - GAP * 2);
    } else {
      const minColWidth = 100 + viewportWidth * 0.1;
      colCount = Math.max(
        2,
        Math.floor((viewportWidth + GAP) / (minColWidth + GAP)),
      );
      colWidth = Math.min(
        MAX_COL_WIDTH,
        (viewportWidth - (colCount + 1) * GAP) / colCount,
      );
    }
    const textWidth = colWidth - CARD_PADDING * 2;
    const contentWidth = colCount * colWidth + (colCount - 1) * GAP;
    const offsetLeft = (viewportWidth - contentWidth) / 2;

    this.engine.maxWidth = textWidth;
    const colHeights = new Float64Array(colCount).fill(GAP);
    const positioned: PositionedCard[] = [];

    for (let i = 0; i < MASONRY_QUIPS.length; i++) {
      let shortest = 0;
      for (let c = 1; c < colCount; c++) {
        if (colHeights[c] < colHeights[shortest]) shortest = c;
      }
      const prepared = this.engine.prepare(
        MASONRY_QUIPS[i],
        {},
        CARD_FONT_SIZE,
      );
      const result = this.engine.layoutPrepared(prepared);
      const totalH = result.totalHeight + CARD_PADDING * 2;

      positioned.push({
        index: i,
        x: offsetLeft + shortest * (colWidth + GAP),
        y: colHeights[shortest],
        w: colWidth,
        h: totalH,
      });
      colHeights[shortest] += totalH + GAP;
    }

    let contentHeight = 0;
    for (let c = 0; c < colCount; c++) {
      if (colHeights[c] > contentHeight) contentHeight = colHeights[c];
    }

    this.positioned = positioned;
    this.colWidth = colWidth;
    this.contentHeight = contentHeight;
    this.scrollView.content.height = contentHeight;
    this.scrollView.content.width = viewportWidth;

    // Full re-layout invalidates every mounted card's cached width.
    for (const [, card] of this.mounted) this.scrollView.content.remove(card);
    this.mounted.clear();
    this.lastScrollTop = -1;
  }

  private reconcileVisible(): void {
    const scrollTop = -this.scrollView.content.y;
    if (Math.abs(scrollTop - this.lastScrollTop) < 1) return;
    this.lastScrollTop = scrollTop;

    const viewTop = scrollTop - OVERSCAN;
    const viewBottom = scrollTop + (this.H - CONTENT_TOP) + OVERSCAN;
    const stillVisible = new Set<number>();

    for (const p of this.positioned) {
      if (p.y > viewBottom || p.y + p.h < viewTop) continue;
      stillVisible.add(p.index);
      if (!this.mounted.has(p.index)) {
        const card = new MasonryCard(MASONRY_QUIPS[p.index], p.w);
        card.width = p.w;
        card.height = p.h;
        card.setPosition(p.x, p.y);
        this.scrollView.content.add(card);
        this.mounted.set(p.index, card);
      }
    }

    for (const [index, card] of this.mounted) {
      if (!stillVisible.has(index)) {
        this.scrollView.content.remove(card);
        this.mounted.delete(index);
      }
    }
  }

  update(dt: number, time: number): void {
    super.update(dt, time);
    this.reconcileVisible();
  }

  hasPendingAnimations(): boolean {
    // Wheel/drag scroll drives content.y through a spring; keep the idle
    // throttle awake so reconcileVisible() keeps mounting/unmounting cards
    // mid-scroll instead of freezing the virtualization window.
    return this.scrollView.content.y !== Math.round(this.scrollView.content.y);
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.scrollView.width = width;
    this.scrollView.height = height - CONTENT_TOP;
    this.scrollView.setPosition(0, CONTENT_TOP);
    this.computeLayout(width);
    this.reconcileVisible();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill("#f0f0f0");
    drawDemoHeader(
      r,
      32,
      "Masonry",
      "Every card's exact height is known before it is placed — no off-screen measure pass.",
    );
    r.fillText(
      `${MASONRY_QUIPS.length} cards · ${this.mounted.size} mounted · col ${Math.round(this.colWidth)}px · ${Math.round(this.contentHeight)}px tall`,
      210,
      HEADER_TITLE_Y,
      FONT.mono(12),
      "#8a8378",
    );
  }
}

export default MasonryDemo;
