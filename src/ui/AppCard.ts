import { type A11yAttributes, type IRenderer } from '@vectojs/core';
import { Image, Text } from '@vectojs/ui';
import type { ForgeApp } from '../apps';
import { displayUrl } from '../apps';
import { clampTextToLines } from './clamp';
import { EditorialCard } from './EditorialCard';
import { COLOR, FONT } from './tokens';

const PADDING = 14;
const SHOT_RATIO = 9 / 16;

/**
 * A "Built on VectoJS" card: live-deployment screenshot, app name, canonical
 * domain, and a short tagline. The whole card is clickable and opens the
 * app's canonical URL in a new tab — forge apps are linked, never embedded.
 * Shares CreationCard's fixed shell and inner-media hover language so the two
 * tiers read as one family.
 */
export class AppCard extends EditorialCard {
  private shotH: number;
  private readonly shot: Image;
  private readonly appName: Text;
  private readonly tagline: Text;
  private readonly urlText: Text;

  constructor(
    width: number,
    private readonly app: ForgeApp,
    invalidate: () => void = () => {},
  ) {
    super(
      `AppCard:${app.id}`,
      app.accent,
      (event) => {
        const currentTarget = (event as { nativeEvent?: { currentTarget?: { tagName?: string } } })
          .nativeEvent?.currentTarget;
        if (currentTarget?.tagName === 'A') return;
        window.open(app.url, '_blank', 'noopener,noreferrer');
      },
      invalidate,
    );
    this.width = width;

    const shotW = width - PADDING * 2;
    this.shotH = Math.round(shotW * SHOT_RATIO);
    const shot = new Image(app.screenshot, {
      width: shotW,
      height: this.shotH,
      fit: app.screenshotMedia.fit,
      focalPoint: app.screenshotMedia.focalPoint,
      alt: `${app.name} screenshot`,
      placeholder: COLOR.groundSunk,
      radius: 8,
      onLoad: invalidate,
    });
    this.mountMedia(shot);
    this.resizeMediaFrame(PADDING, PADDING, shotW, this.shotH);
    this.shot = shot;

    const nameY = PADDING + this.shotH + 16;
    const name = new Text(app.name, {
      font: FONT.display(16),
      color: COLOR.textPrimary,
    });
    name.setPosition(PADDING, nameY);
    this.add(name);
    this.appName = name;

    this.urlText = new Text(`${displayUrl(app.url)} ↗`, {
      font: FONT.mono(10),
      color: COLOR.ink,
    });
    // Right-aligned against the card edge, sharing the name's baseline band.
    this.urlText.setPosition(width - PADDING - this.urlText.width, nameY + 4);
    this.add(this.urlText);

    const tagline = new Text(app.tagline, {
      font: FONT.body(12),
      color: COLOR.textMuted,
      maxWidth: width - PADDING * 2,
    });
    clampTextToLines(tagline, app.tagline, 2);
    tagline.setPosition(PADDING, nameY + name.height + 8);
    this.add(tagline);
    this.tagline = tagline;

    this.height = nameY + name.height + 8 + tagline.height + PADDING + 4;
  }

  resizeTo(width: number): void {
    this.width = width;
    const shotW = width - PADDING * 2;
    this.shotH = Math.round(shotW * SHOT_RATIO);
    this.shot.width = shotW;
    this.shot.height = this.shotH;
    this.resizeMediaFrame(PADDING, PADDING, shotW, this.shotH);
    this.appName.setPosition(PADDING, PADDING + this.shotH + 16);
    this.urlText.setPosition(width - PADDING - this.urlText.width, this.appName.y + 4);
    this.tagline.setMaxWidth(width - PADDING * 2);
    clampTextToLines(this.tagline, this.app.tagline, 2);
    this.tagline.setPosition(PADDING, this.appName.y + this.appName.height + 8);
    this.height = this.appName.y + this.appName.height + 8 + this.tagline.height + PADDING + 4;
  }

  /** Bottom-aligns metadata when the grid stretches this card taller than natural. */
  setUniformHeight(h: number): void {
    this.height = h;
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      tag: 'a',
      role: 'link',
      label: `Open ${this.app.name}`,
      href: this.app.url,
      target: '_blank',
    };
  }

  override render(r: IRenderer): void {
    super.render(r);
  }
}
