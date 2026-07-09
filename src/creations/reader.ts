import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";

/**
 * A reflowing text reader: paragraphs of text laid out normally, but any word
 * near the cursor is pushed away from it, and the whole paragraph reflows
 * continuously to avoid the pointer. Scroll by dragging or with the wheel.
 *
 * This is deliberately hard to do well in the DOM: reflowing live text around
 * an arbitrary moving point at paragraph scale means re-measuring and
 * re-positioning every word, every frame, which is exactly what a browser's
 * layout engine is not built to do smoothly. Here it's a per-word position
 * lerp recomputed once per frame — cheap, because nothing about it touches
 * the DOM at all.
 *
 * The text itself is original writing for this demo, not excerpted from any
 * book — the point of this piece is the interaction, not the prose.
 */

interface Word {
  text: string;
  width: number;
  homeX: number;
  homeY: number;
  offsetX: number;
  offsetY: number;
}

const PARAGRAPHS: string[] = [
  "Every piece of writing lives on a page, and every page assumes the reader's eye is the only thing moving across it. Words hold still. Lines don't flinch. That stillness is so ordinary we rarely notice it's a choice, rather than a law of nature.",
  "This page makes a different choice. Move your cursor near any word here and it steps aside, the way a crowd on a narrow sidewalk parts around someone walking the other direction. The rest of the line closes the gap behind it, then opens again once you've moved on. Nothing about the underlying text has changed — only where each word happens to be standing at this exact moment.",
  "That distinction, between what a thing is and where it happens to be drawn, is the entire premise of a scene graph. A word here is not a span of styled HTML sitting in a document flow; it is a small object with a home position, a current position, and a rule for how to get from one to the other over time. Ask it where it lives permanently, and it will point to its home. Ask it where it is right now, and it might be somewhere else entirely, mid-flight, avoiding you.",
  "None of this required a layout engine to be taught a new trick. It required removing the assumption that text has to hold still in the first place, and then asking, plainly, what happens if it doesn't.",
  "Scroll down. The words further along have been waiting the whole time, laid out and idle, spending nothing until you arrive.",
];

const LINE_HEIGHT = 28;
const PARAGRAPH_GAP = 18;
const FONT = "17px Georgia, serif";
const REPEL_RADIUS = 90;
const REPEL_STRENGTH = 46;
const LERP_SPEED = 10; // higher = snappier settle, per second

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

  private buildLayout(): void {
    const padding = 32;
    const usableWidth = Math.max(200, this.width - padding * 2);
    const spaceWidth = measureText(" ", FONT);

    this.words = [];
    let y = padding;

    for (const paragraph of PARAGRAPHS) {
      let x = padding;
      for (const raw of paragraph.split(" ")) {
        const w = measureText(raw, FONT);
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
        });
        x += w + spaceWidth;
      }
      y += LINE_HEIGHT + PARAGRAPH_GAP;
    }

    this.contentHeight = y + padding;
    this.maxScroll = Math.max(0, this.contentHeight - this.height);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
    this.builtForWidth = this.width;
  }

  override update(dt: number, _time: number): void {
    super.update(dt, _time);

    if (this.builtForWidth !== this.width && this.width > 0) {
      this.buildLayout();
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

    for (const word of this.words) {
      const y = word.homeY - this.scrollY + word.offsetY;
      if (y < -LINE_HEIGHT || y > this.height + LINE_HEIGHT) continue;
      const x = word.homeX + word.offsetX;
      r.fillText(word.text, x, y, FONT, "#2b2620");
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
