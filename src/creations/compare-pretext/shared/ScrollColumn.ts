/**
 * A gallery-local scroll container for the compare-pretext demos that need
 * plain, non-inertial scrolling with a visible scrollbar — the opposite of
 * `@vectojs/ui`'s `ScrollView`/`VirtualList`, which drive position through a
 * spring (the "inertia" the demos here want gone). Kept local so it can't
 * destabilize those shared components other creations rely on.
 *
 * Content is a child `Group` translated by `-scrollY` directly (no spring), so
 * wheel/drag map 1:1 and stop instantly. Clips to its own box; draws a
 * right-edge scrollbar thumb. Selection works because it isn't `interactive`
 * over its whole surface — only wheel + an explicit scrollbar-drag band claim
 * the pointer; a body drag still starts a native text selection.
 */
import { Entity, type IRenderer } from "@vectojs/core";

const SCROLLBAR_W = 8;
const SCROLLBAR_PAD = 3;
const MIN_THUMB = 28;

export class ScrollColumn extends Entity {
  readonly content: Entity;
  private viewH = 0;
  private viewW = 0;
  private scrollY = 0;
  private contentH = 0;
  private draggingThumb = false;
  private dragStartY = 0;
  private dragStartScroll = 0;
  private hoverThumb = false;

  constructor(width: number, height: number, name = "ScrollColumn") {
    super(name);
    this.viewW = width;
    this.viewH = height;
    this.width = width;
    this.height = height;
    this.clipChildren = true;
    this.interactive = true;

    this.content = new (class extends Entity {
      isPointInside(): boolean {
        return false;
      }
      render(): void {}
    })("ScrollColumnContent");
    this.add(this.content);

    this.on("wheel", (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      this.scrollBy(e.deltaY);
    });
    // Only a pointerdown on the scrollbar thumb starts a scroll drag; a
    // pointerdown anywhere else falls through to native text selection.
    this.on("pointerdown", (e: { localX?: number; localY?: number }) => {
      if (e.localX === undefined || e.localY === undefined) return;
      if (this.inThumb(e.localX, e.localY)) {
        this.draggingThumb = true;
        this.dragStartY = e.localY;
        this.dragStartScroll = this.scrollY;
      }
    });
    this.on("pointermove", (e: { localX?: number; localY?: number }) => {
      if (e.localX !== undefined && e.localY !== undefined) {
        const h = this.inThumb(e.localX, e.localY);
        if (h !== this.hoverThumb) {
          this.hoverThumb = h;
          this.scene?.markDirty();
        }
      }
      if (!this.draggingThumb || e.localY === undefined) return;
      const maxScroll = Math.max(0, this.contentH - this.viewH);
      const track = this.viewH - SCROLLBAR_PAD * 2;
      const ratio = maxScroll / Math.max(1, track - this.thumbH());
      this.setScroll(
        this.dragStartScroll + (e.localY - this.dragStartY) * ratio,
      );
    });
    const end = (): void => {
      this.draggingThumb = false;
    };
    this.on("pointerup", end);
    this.on("pointerleave", () => {
      this.draggingThumb = false;
      this.hoverThumb = false;
    });
  }

  /** Only claim the pointer over the scrollbar thumb — body clicks select text. */
  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    // Claim wheel over the whole viewport but pointerdown only over the thumb.
    return (
      local.x >= 0 &&
      local.x <= this.viewW &&
      local.y >= 0 &&
      local.y <= this.viewH
    );
  }

  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.width = width;
    this.height = height;
    this.clampScroll();
  }

  setContentHeight(h: number): void {
    this.contentH = h;
    this.clampScroll();
  }

  get scroll(): number {
    return this.scrollY;
  }

  scrollBy(dy: number): void {
    this.setScroll(this.scrollY + dy);
  }

  private setScroll(y: number): void {
    const maxScroll = Math.max(0, this.contentH - this.viewH);
    const clamped = Math.max(0, Math.min(maxScroll, y));
    if (clamped === this.scrollY) return;
    this.scrollY = clamped;
    this.content.setPosition(0, -clamped);
    this.scene?.markDirty();
  }

  private clampScroll(): void {
    const maxScroll = Math.max(0, this.contentH - this.viewH);
    if (this.scrollY > maxScroll) this.setScroll(maxScroll);
  }

  private thumbH(): number {
    if (this.contentH <= this.viewH) return 0;
    const track = this.viewH - SCROLLBAR_PAD * 2;
    return Math.max(MIN_THUMB, (this.viewH / this.contentH) * track);
  }

  private thumbY(): number {
    const maxScroll = Math.max(1, this.contentH - this.viewH);
    const track = this.viewH - SCROLLBAR_PAD * 2 - this.thumbH();
    return SCROLLBAR_PAD + (this.scrollY / maxScroll) * track;
  }

  private inThumb(x: number, y: number): boolean {
    const th = this.thumbH();
    if (th <= 0) return false;
    const tx = this.viewW - SCROLLBAR_W - SCROLLBAR_PAD;
    const ty = this.thumbY();
    return x >= tx - 4 && x <= tx + SCROLLBAR_W + 4 && y >= ty && y <= ty + th;
  }

  render(r: IRenderer): void {
    const th = this.thumbH();
    if (th <= 0) return;
    const tx = this.viewW - SCROLLBAR_W - SCROLLBAR_PAD;
    const ty = this.thumbY();
    // track
    r.beginPath();
    r.roundRect(
      tx,
      SCROLLBAR_PAD,
      SCROLLBAR_W,
      this.viewH - SCROLLBAR_PAD * 2,
      SCROLLBAR_W / 2,
    );
    r.fill("rgba(128,128,128,0.12)");
    // thumb
    r.beginPath();
    r.roundRect(tx, ty, SCROLLBAR_W, th, SCROLLBAR_W / 2);
    r.fill(
      this.hoverThumb || this.draggingThumb
        ? "rgba(128,128,128,0.55)"
        : "rgba(128,128,128,0.35)",
    );
  }
}
