/**
 * Rich Text — one paragraph of styled runs with atomic chips embedded in it.
 *
 * This is a rebuild. The previous version expanded the sentence into ~88
 * sibling entities (one `Text` per word, one per whitespace run, plus a `Pill`
 * entity per chip) inside a `Flow`, which meant `Stack.layout()`'s box packing
 * stood in for text layout. That produced four measurable defects at once:
 * every inter-word gap was 2.12x too wide (a whitespace-only `Text` measures
 * 0px yet still paid a gap on each side), the mixed-script run could not break
 * and overflowed the card by 217px, chip labels sat 4.5px below the body
 * baseline, and copied text came out scrambled because 87 flat mirrors in mixed
 * coordinate spaces defeated the projection sort.
 *
 * Now the paragraph is ONE `RichText`. The engine owns bidi, CJK line breaking
 * and real space advances, and emits a single coherent content projection — so
 * selection, copy and screen-reader order follow from the text itself.
 */

import { Entity, type A11yAttributes, type IRenderer } from '@vectojs/core';
import { Card, RichText } from '@vectojs/ui';
import { CONTENT_TOP, HEADER_TITLE_Y, drawDemoHeader } from '../shared/chrome';
import { FONT, WARM } from '../shared/theme';
import { clearChipRasterCache } from './rich-note-chips';
import { buildNoteSpans } from './rich-note-content';

const BODY_MIN_WIDTH = 260;
const BODY_DEFAULT_WIDTH = 516;
const BODY_MAX_WIDTH = 760;
const PAGE_MARGIN = 28;
const NOTE_TOP = CONTENT_TOP + 24;
const NOTE_PAD = 22;

/** Body size and line height, matching the reference model. */
const BODY_SIZE = 17;
const BODY_LINE_HEIGHT = 34;

const SLIDER_TRACK_MAX = 260;

export class RichNoteDemo extends Entity {
  private W = 0;
  private H = 0;
  private readonly noteCard: Card;
  private readonly body: RichText;
  private requestedWidth = BODY_DEFAULT_WIDTH;
  private bodyWidth = BODY_DEFAULT_WIDTH;
  private dragging = false;
  private sliderTrackX = PAGE_MARGIN + 320;
  private sliderTrackW = SLIDER_TRACK_MAX;

  constructor() {
    super('RichNoteDemo');

    this.noteCard = new Card({
      width: BODY_DEFAULT_WIDTH + NOTE_PAD * 2,
      height: 200,
      bg: WARM.panel,
      border: WARM.rule,
      borderWidth: 1,
      radius: 20,
    });

    this.body = new RichText(buildNoteSpans(), {
      font: FONT.sans(BODY_SIZE, 500),
      color: WARM.ink,
      maxWidth: BODY_DEFAULT_WIDTH,
      linkColor: WARM.accent,
      selectable: true,
    });
    this.body.setPosition(NOTE_PAD, NOTE_PAD);

    // The body is a child of the card so a slider-only change moves both
    // together; keeping them as siblings previously let them desync.
    this.noteCard.add(this.body);
    this.add(this.noteCard);

    this.interactive = true;
    // `localX`/`localY` are already entity-local — the engine resolves them for
    // whichever listener is running, so no manual `worldToLocal` is needed.
    this.on('pointerdown', (e) => {
      if (!this.pointInSlider(e.localX, e.localY)) return;
      this.dragging = true;
      this.updateFromPointer(e.localX);
    });
    this.on('pointermove', (e) => {
      if (this.dragging) this.updateFromPointer(e.localX);
    });
    this.on('pointerup', () => {
      this.dragging = false;
    });
    this.on('pointerleave', () => {
      this.dragging = false;
    });

    this.applyWidth();
  }

  /**
   * Keep this entity out of the DOM hit-testing stack.
   *
   * This entity is `interactive` (for the width slider) and sized to the whole
   * viewport, and core projects every such node as a shadow element with
   * `pointerEvents: 'auto'`. That element sat above every content mirror and
   * swallowed the `mousedown` that starts a selection drag, which is why the
   * note could not be selected at all. Declining pointer events here hands them
   * back to the text mirrors underneath; canvas-side slider dragging is
   * unaffected because it is routed by `isPointInside`, not by the DOM.
   */
  override getA11yAttributes(): A11yAttributes {
    return { pointerEvents: 'none' };
  }

  private pointInSlider(x?: number, y?: number): boolean {
    if (x === undefined || y === undefined) return false;
    return (
      x >= this.sliderTrackX - 12 &&
      x <= this.sliderTrackX + this.sliderTrackW + 12 &&
      y >= HEADER_TITLE_Y - 16 &&
      y <= HEADER_TITLE_Y + 12
    );
  }

  private updateFromPointer(localX?: number): void {
    if (localX === undefined) return;
    const t = Math.max(0, Math.min(1, (localX - this.sliderTrackX) / this.sliderTrackW));
    const max = this.maxBodyWidthFor(this.W);
    this.requestedWidth = Math.round(BODY_MIN_WIDTH + t * (max - BODY_MIN_WIDTH));
    this.applyWidth();
    this.scene?.markDirty();
  }

  private maxBodyWidthFor(viewportWidth: number): number {
    const available = viewportWidth - PAGE_MARGIN * 2 - NOTE_PAD * 2;
    return Math.max(BODY_MIN_WIDTH, Math.min(BODY_MAX_WIDTH, available));
  }

  private applyWidth(): void {
    const max = this.maxBodyWidthFor(this.W || BODY_DEFAULT_WIDTH + PAGE_MARGIN * 2 + NOTE_PAD * 2);
    this.bodyWidth = Math.max(BODY_MIN_WIDTH, Math.min(max, this.requestedWidth));

    this.body.setMaxWidth(this.bodyWidth);

    const cardW = this.bodyWidth + NOTE_PAD * 2;
    this.noteCard.width = cardW;
    this.noteCard.height = this.body.height + NOTE_PAD * 2;
    this.noteCard.setPosition(Math.max(PAGE_MARGIN, (this.W - cardW) / 2), NOTE_TOP);
  }

  override isPointInside(x: number, y: number): boolean {
    // Only the slider band belongs to this entity. Claiming the whole box would
    // take canvas hits away from the text underneath.
    const local = this.worldToLocal(x, y);
    if (!local) return false;
    return this.pointInSlider(local.x, local.y);
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.sliderTrackX = PAGE_MARGIN + 320;
    this.sliderTrackW = Math.min(SLIDER_TRACK_MAX, Math.max(140, width - this.sliderTrackX - 40));
    this.applyWidth();
  }

  override destroy(): void {
    clearChipRasterCache();
    super.destroy();
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(WARM.page);

    drawDemoHeader(
      r,
      PAGE_MARGIN,
      'Rich Text',
      'Text runs, links, code spans, and atomic chips — adjust the width and the chips stay whole while text keeps wrapping.',
    );

    const trackY = HEADER_TITLE_Y - 4;
    r.beginPath();
    r.roundRect(this.sliderTrackX, trackY, this.sliderTrackW, 4, 2);
    r.fill(WARM.rule);

    const max = this.maxBodyWidthFor(this.W);
    const t = (this.bodyWidth - BODY_MIN_WIDTH) / Math.max(1, max - BODY_MIN_WIDTH);
    const handleX = this.sliderTrackX + t * this.sliderTrackW;
    r.beginPath();
    r.roundRect(handleX - 7, trackY - 6, 14, 16, 7);
    r.fill(WARM.accent);

    r.fillText(
      `Text width: ${Math.round(this.bodyWidth)}px`,
      this.sliderTrackX,
      trackY - 14,
      FONT.sans(12, 600),
      WARM.muted,
    );
  }
}

export default RichNoteDemo;

export { BODY_LINE_HEIGHT, BODY_MIN_WIDTH, BODY_MAX_WIDTH, BODY_DEFAULT_WIDTH };
