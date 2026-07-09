import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";
import { CHAPTERS } from "./alice-content";

/**
 * A reflowing text reader: the full text of Alice's Adventures in Wonderland
 * (Lewis Carroll, 1865 — public domain worldwide), laid out normally, but any
 * word near the cursor is pushed away from it, and the whole page reflows
 * continuously to avoid the pointer. Drag with the left mouse button or use
 * the wheel to scroll.
 *
 * This is deliberately hard to do well in the DOM: reflowing live text around
 * an arbitrary moving point, at whole-book scale (twelve chapters, tens of
 * thousands of words), means re-measuring and re-positioning every word,
 * every frame — exactly what a browser's layout engine is not built to do
 * smoothly. Here it's a per-word position lerp recomputed once per frame,
 * cheap because nothing about it touches the DOM at all.
 *
 * Two things make this hold 60fps at book scale rather than just paragraph
 * scale: word widths are measured once and cached (a real book repeats words
 * — "the", "and", "Alice" — often enough that this cuts measurement work by
 * an order of magnitude), and a full relayout only runs after the viewport
 * width has been stable for a moment, not on every intermediate tick while
 * a window is being dragged to a new size or the browser is mid-zoom.
 */

interface Word {
  text: string;
  width: number;
  homeX: number;
  homeY: number;
  offsetX: number;
  offsetY: number;
  isHeading: boolean;
}

const LINE_HEIGHT = 26;
const HEADING_LINE_HEIGHT = 34;
const PARAGRAPH_GAP = 14;
const CHAPTER_GAP = 40;
const BODY_FONT = "16px Georgia, serif";
const HEADING_FONT = "600 20px Georgia, serif";
const REPEL_RADIUS = 85;
const REPEL_STRENGTH = 42;
const LERP_SPEED = 10; // higher = snappier settle, per second
const RELAYOUT_DEBOUNCE_MS = 150;

export default class Reader extends Entity {
  private words: Word[] = [];
  private contentHeight = 0;
  private scrollY = 0;
  private maxScroll = 0;

  private cursorX = -9999;
  private cursorY = -9999;
  private dragging = false;
  private dragLastY = 0;

  private builtForWidth = -1;
  private pendingWidth = -1;
  private widthStableMs = 0;
  private widthMeasureCache = new Map<string, number>();

  constructor() {
    super("Reader");
    this.interactive = true;
    this.wireEvents();
  }

  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return (
      local.x >= 0 &&
      local.x <= this.width &&
      local.y >= 0 &&
      local.y <= this.height
    );
  }

  private wireEvents(): void {
    this.on("pointerdown", (e: any) => {
      this.dragging = true;
      this.dragLastY = (e.localY as number | undefined) ?? 0;
    });

    this.on("pointermove", (e: any) => {
      const x = e.localX as number | undefined;
      const y = e.localY as number | undefined;
      if (x !== undefined) this.cursorX = x;
      if (y !== undefined) this.cursorY = y;

      if (this.dragging && y !== undefined) {
        const dy = y - this.dragLastY;
        this.dragLastY = y;
        this.setScroll(this.scrollY - dy);
      }
      this.scene?.markDirty();
    });

    const endDrag = (): void => {
      this.dragging = false;
    };
    this.on("pointerup", endDrag);
    this.on("pointerleave", () => {
      endDrag();
      this.cursorX = -9999;
      this.cursorY = -9999;
      this.scene?.markDirty();
    });

    this.on("wheel", (e: any) => {
      e.preventDefault?.();
      const delta = (e.deltaY as number | undefined) ?? 0;
      this.setScroll(this.scrollY + delta);
      this.scene?.markDirty();
    });
  }

  private setScroll(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.maxScroll, y));
  }

  /** Cached width lookup — a full book repeats far too many words to measure fresh every layout. */
  private widthOf(text: string, font: string): number {
    const key = font + "|" + text;
    let w = this.widthMeasureCache.get(key);
    if (w === undefined) {
      w = measureText(text, font);
      this.widthMeasureCache.set(key, w);
    }
    return w;
  }

  private buildLayout(): void {
    const padding = 32;
    const usableWidth = Math.max(200, this.width - padding * 2);
    const spaceWidth = this.widthOf(" ", BODY_FONT);

    this.words = [];
    let y = padding;

    for (const chapter of CHAPTERS) {
      // Heading as one non-wrapping unit, its own line.
      const hw = this.widthOf(chapter.heading, HEADING_FONT);
      this.words.push({
        text: chapter.heading,
        width: hw,
        homeX: padding,
        homeY: y,
        offsetX: 0,
        offsetY: 0,
        isHeading: true,
      });
      y += HEADING_LINE_HEIGHT * 2;

      for (const paragraph of chapter.paragraphs) {
        let x = padding;
        for (const raw of paragraph.split(" ")) {
          const w = this.widthOf(raw, BODY_FONT);
          if (x > padding && x + w > padding + usableWidth) {
            x = padding;
            y += LINE_HEIGHT;
          }
          this.words.push({
            text: raw,
            width: w,
            homeX: x,
            homeY: y,
            offsetX: 0,
            offsetY: 0,
            isHeading: false,
          });
          x += w + spaceWidth;
        }
        y += LINE_HEIGHT + PARAGRAPH_GAP;
      }
      y += CHAPTER_GAP;
    }

    this.contentHeight = y + padding;
    this.maxScroll = Math.max(0, this.contentHeight - this.height);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
    this.builtForWidth = this.width;
  }

  override update(dt: number, _time: number): void {
    super.update(dt, _time);

    // Debounced relayout: a full-book layout pass is real work (tens of
    // thousands of words), so it only runs once the width has held steady
    // for a moment — not on every tick while a window resize or a browser
    // zoom is still in progress.
    if (this.width > 0) {
      if (this.width !== this.pendingWidth) {
        this.pendingWidth = this.width;
        this.widthStableMs = 0;
      } else if (this.builtForWidth !== this.width) {
        this.widthStableMs += dt;
        if (this.widthStableMs >= RELAYOUT_DEBOUNCE_MS) {
          this.buildLayout();
        }
      }
    }

    const lerpT = Math.min(1, (LERP_SPEED * dt) / 1000);

    for (const word of this.words) {
      const wx = word.homeX + word.width / 2;
      const wy = word.homeY - this.scrollY;

      const dx = wx - this.cursorX;
      const dy = wy - this.cursorY;
      const dist = Math.hypot(dx, dy);

      let targetX = 0;
      let targetY = 0;
      if (dist < REPEL_RADIUS && dist > 0.01) {
        const push = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH;
        targetX = (dx / dist) * push;
        targetY = (dy / dist) * push;
      }

      word.offsetX += (targetX - word.offsetX) * lerpT;
      word.offsetY += (targetY - word.offsetY) * lerpT;
    }

    // Word offsets mutate directly, not through the tracked driver/tween
    // system, so Scene can't tell this is animating and would throttle to
    // 2fps after the first frame without this.
    this.scene?.markDirty();
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("#f4f1ea");

    r.save();
    r.clip(0, 0, this.width, this.height);

    const visibleTop = -HEADING_LINE_HEIGHT * 2;
    const visibleBottom = this.height + HEADING_LINE_HEIGHT * 2;

    for (const word of this.words) {
      const y = word.homeY - this.scrollY + word.offsetY;
      if (y < visibleTop || y > visibleBottom) continue;
      const x = word.homeX + word.offsetX;
      const font = word.isHeading ? HEADING_FONT : BODY_FONT;
      const color = word.isHeading ? "#5b3a29" : "#2b2620";
      r.fillText(word.text, x, y, font, color);
    }

    r.restore();

    r.fillText(
      "Drag to scroll · scroll wheel also works · move your cursor over the text",
      16,
      this.height - 16,
      "12px Inter, sans-serif",
      "rgba(0, 0, 0, 0.35)",
    );
  }
}
