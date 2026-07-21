/**
 * A thin right-edge scrollbar for the Stream Reader's markdown view — a PURE
 * VISUAL. It renders a track + thumb from live scroll geometry (`metrics()`) and
 * nothing else: it is deliberately NOT `interactive`, so VectoJS never projects
 * an a11y shadow element for it. That matters twice over — an interactive
 * full-width element would (1) sit over the document's selectable text
 * projection and block selection, and (2) intercept pointer events while only
 * forwarding `pointerdown`/`pointerup` (not `pointermove`), which a drag needs.
 *
 * Hit-testing and dragging therefore live in the reader's window-level pointer
 * handlers (see StreamReader.onWindowPointer*), which fire everywhere and feed
 * back through {@link ScrollBar.thumbBand} and the `hover`/`dragging` flags.
 * Thumb sizing math is adapted from `compare-pretext/shared/ScrollColumn`.
 */
import { Entity, type IRenderer } from "@vectojs/core";

export const SCROLLBAR_W = 8;
export const SCROLLBAR_PAD = 4;
export const SCROLLBAR_MIN_THUMB = 32;
/** Right-edge pointer-claim band width (px) — wider than the thumb for easy grabbing. */
export const SCROLLBAR_HIT_BAND = 22;

export interface ScrollMetrics {
  /** Height of the visible viewport (the scroll window). */
  viewH: number;
  /** Total scrollable content height. */
  contentH: number;
  /** Current scroll offset (0 = top). */
  scrollY: number;
}

export class ScrollBar extends Entity {
  /** Live scroll geometry, read on every render and hit-test. */
  public metrics: () => ScrollMetrics = () => ({
    viewH: 0,
    contentH: 0,
    scrollY: 0,
  });
  /** Visual state, driven by the reader's window pointer handlers. */
  public hover = false;
  public dragging = false;

  constructor() {
    super("ScrollBar");
    this.interactive = false; // pure overlay — see class doc
  }

  private thumbH(): number {
    const { viewH, contentH } = this.metrics();
    if (contentH <= viewH || viewH <= 0) return 0;
    const track = this.height - SCROLLBAR_PAD * 2;
    return Math.max(SCROLLBAR_MIN_THUMB, (viewH / contentH) * track);
  }

  private thumbY(): number {
    const { viewH, contentH, scrollY } = this.metrics();
    const maxScroll = Math.max(1, contentH - viewH);
    const track = this.height - SCROLLBAR_PAD * 2 - this.thumbH();
    return (
      SCROLLBAR_PAD +
      (Math.max(0, Math.min(scrollY, maxScroll)) / maxScroll) * track
    );
  }

  /**
   * The thumb's rectangle in this entity's local space, or `null` when the
   * content fits (no bar). The reader maps a window pointer into local space to
   * hit-test against this and to convert drag distance into scroll offset.
   */
  thumbBand(): { top: number; height: number; trackTravel: number } | null {
    const th = this.thumbH();
    if (th <= 0) return null;
    return {
      top: this.thumbY(),
      height: th,
      trackTravel: this.height - SCROLLBAR_PAD * 2 - th,
    };
  }

  override isPointInside(): boolean {
    return false; // never claim the pointer; the reader owns hit-testing
  }

  override render(r: IRenderer): void {
    const th = this.thumbH();
    if (th <= 0) return; // nothing to scroll → no bar
    const tx = this.width - SCROLLBAR_W - SCROLLBAR_PAD;
    // Track
    r.beginPath();
    r.roundRect(
      tx,
      SCROLLBAR_PAD,
      SCROLLBAR_W,
      this.height - SCROLLBAR_PAD * 2,
      SCROLLBAR_W / 2,
    );
    r.fill("rgba(120,110,95,0.10)");
    // Thumb
    r.beginPath();
    r.roundRect(tx, this.thumbY(), SCROLLBAR_W, th, SCROLLBAR_W / 2);
    r.fill(
      this.dragging || this.hover
        ? "rgba(120,110,95,0.60)"
        : "rgba(120,110,95,0.34)",
    );
  }
}
