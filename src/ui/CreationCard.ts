import { Entity, type A11yAttributes, type IRenderer } from '@vectojs/core';
import { Image, Text } from '@vectojs/ui';
import type { Creation } from '../registry';
import { ThumbDoodle } from './ThumbDoodle';
import { clampTagsToWidth, clampTextToLines } from './clamp';
import { EditorialCard } from './EditorialCard';
import { COLOR, FONT, accentFor } from './tokens';

const PADDING = 16;
const THUMB_RATIO = 0.625; // 16:10 — the thumbnail should dominate the card
const BADGE_RADIUS = 18;
/** Gap the tag pill leaves on each side of its text. */
const TAG_PILL_PAD_X = 8;
/**
 * Separator between tags. Tighter than it looks: at `FONT.mono(11)` the old
 * `'   ·   '` cost 26px more per gap than this does, which was most of the
 * overflow on its own.
 */
const TAG_SEPARATOR = ' · ';

/** Widest the tag text may be before its pill would escape a `width` card. */
function tagsBudget(width: number): number {
  return width - PADDING * 2 - TAG_PILL_PAD_X * 2;
}

/**
 * A launch triangle in a translucent disc, centred on the thumbnail. Added as
 * the card's last child so it paints over the thumb; its opacity is driven by
 * the parent's media-hover fraction, so it fades in on the same spring that
 * scales the clipped preview — no separately animated field.
 */
class PlayBadge extends Entity {
  constructor(private readonly liftFraction: () => number) {
    super('PlayBadge');
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const t = this.liftFraction();
    if (t <= 0.01) return;
    r.setGlobalAlpha(0.9 * t);
    r.beginPath();
    r.arc(0, 0, BADGE_RADIUS, 0, Math.PI * 2);
    r.fill(COLOR.textPrimary);
    r.beginPath();
    r.moveTo(-5, -8);
    r.lineTo(9, 0);
    r.lineTo(-5, 8);
    r.closePath();
    r.fill(COLOR.void);
    r.setGlobalAlpha(1);
  }
}

export class CreationCard extends EditorialCard {
  private thumbH: number;
  private readonly thumb: ThumbDoodle;
  private readonly previewImage: Image | null;
  private readonly titleText: Text;
  private readonly descText: Text;
  private readonly tagsText: Text;
  private readonly badge: PlayBadge;

  constructor(
    width: number,
    private readonly creation: Creation,
    seed: number,
    onOpen: (creation: Creation) => void,
    invalidate: () => void = () => {},
  ) {
    const accent = accentFor(creation.id);
    super(`CreationCard:${creation.id}`, accent, () => onOpen(creation), invalidate);
    this.width = width;
    this.height = 0; // natural height set below; grid may stretch it after

    this.thumbH = Math.round((width - PADDING * 2) * THUMB_RATIO);
    const preview = creation.preview;
    const mediaWidth = width - PADDING * 2;
    const thumb = new ThumbDoodle(mediaWidth, this.thumbH, seed, accent);
    this.thumb = thumb;
    this.previewImage = preview
      ? new Image(preview.src, {
          width: mediaWidth,
          height: this.thumbH,
          fit: 'cover',
          focalPoint: preview.focalPoint,
          alt: preview.alt,
          placeholder: COLOR.groundSunk,
          radius: 10,
          onLoad: invalidate,
        })
      : null;
    this.mountMedia(this.previewImage ?? thumb);
    this.resizeMediaFrame(PADDING, PADDING, width - PADDING * 2, this.thumbH);

    const titleY = PADDING + this.thumbH + 20;
    const titleText = new Text(creation.title, {
      font: FONT.display(15),
      color: COLOR.textPrimary,
      maxWidth: width - PADDING * 2,
    });
    titleText.setPosition(PADDING, titleY);
    this.add(titleText);
    this.titleText = titleText;

    const descY = titleY + titleText.height + 10;
    const descText = new Text(creation.description, {
      font: FONT.body(12),
      color: COLOR.textMuted,
      maxWidth: width - PADDING * 2,
    });
    clampTextToLines(descText, creation.description, 2);
    descText.setPosition(PADDING, descY);
    this.add(descText);
    this.descText = descText;

    this.tagsText = new Text('', {
      font: FONT.mono(11),
      color: COLOR.textFaint,
    });
    // The pill is sized from this text, so it has to fit the card up front:
    // `Text` has no ellipsis and the card does not clip, so an overflowing tag
    // row escapes and is painted over by the next card in the row.
    clampTagsToWidth(this.tagsText, creation.tags, TAG_SEPARATOR, tagsBudget(width));
    this.add(this.tagsText);

    // Natural height; setUniformHeight may stretch it (tags stay bottom-anchored).
    this.setUniformHeight(descY + descText.height + 14 + 26 + PADDING);

    const badge = new PlayBadge(() => this.mediaHoverFraction());
    this.badge = badge;
    badge.setPosition(this.width / 2 - PADDING, this.thumbH / 2);
    this.mediaFrame.add(badge);
  }

  resizeTo(width: number): void {
    this.width = width;
    this.thumbH = Math.round((width - PADDING * 2) * THUMB_RATIO);
    this.thumb.width = width - PADDING * 2;
    this.thumb.height = this.thumbH;
    if (this.previewImage) {
      this.previewImage.width = width - PADDING * 2;
      this.previewImage.height = this.thumbH;
    }
    this.titleText.setMaxWidth(width - PADDING * 2);
    const titleY = PADDING + this.thumbH + 20;
    this.titleText.setPosition(PADDING, titleY);
    this.descText.setMaxWidth(width - PADDING * 2);
    clampTextToLines(this.descText, this.creation.description, 2);
    this.descText.setPosition(PADDING, titleY + this.titleText.height + 10);
    this.setUniformHeight(this.descText.y + this.descText.height + 14 + 26 + PADDING);
    this.resizeMediaFrame(PADDING, PADDING, width - PADDING * 2, this.thumbH);
    this.badge.setPosition(this.width / 2 - PADDING, this.thumbH / 2);
    clampTagsToWidth(this.tagsText, this.creation.tags, TAG_SEPARATOR, tagsBudget(width));
  }

  /**
   * Sets the card's height (used by the grid to equalize a row) and re-anchors
   * the tag pill to the bottom edge, so stretched cards keep their footer flush
   * instead of leaving a hole under the description.
   */
  setUniformHeight(h: number): void {
    this.height = h;
    this.tagsText.setPosition(PADDING + TAG_PILL_PAD_X, h - PADDING - 22 + 5);
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: `Open ${this.creation.title}`,
    };
  }

  override render(r: IRenderer): void {
    super.render(r);

    const pillW = this.tagsText.width + TAG_PILL_PAD_X * 2;
    const pillY = this.height - PADDING - 22;
    r.beginPath();
    r.roundRect(PADDING, pillY, pillW, 22, 11);
    r.fill(COLOR.groundSunk);
  }
}
