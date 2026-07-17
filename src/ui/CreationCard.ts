import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { ThumbDoodle } from "./ThumbDoodle";
import { clampTextToLines } from "./clamp";
import { COLOR, FONT, accentFor, type Accent } from "./tokens";

const PADDING = 16;
const THUMB_RATIO = 0.625; // 16:10 — the thumbnail should dominate the card
const CARD_RADIUS = 14;
const LIFT = 8;
const BADGE_RADIUS = 18;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * A launch triangle in a translucent disc, centred on the thumbnail. Added as
 * the card's last child so it paints over the thumb; its opacity is driven by
 * the parent's hover-lift fraction, so it fades in on exactly the same spring
 * that raises the card — no separately animated field.
 */
class PlayBadge extends Entity {
  constructor(private readonly liftFraction: () => number) {
    super("PlayBadge");
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

export class CreationCard extends Entity {
  private hovered = false;
  private baseY = 0;
  private readonly accent: Accent;
  private readonly thumbH: number;
  private readonly tagsText: Text;

  constructor(
    width: number,
    private readonly creation: Creation,
    seed: number,
    private readonly onOpen: (creation: Creation) => void,
  ) {
    super(`CreationCard:${creation.id}`);
    this.width = width;
    this.height = 0; // natural height set below; grid may stretch it after
    this.interactive = true;
    this.accent = accentFor(creation.id);

    this.thumbH = Math.round((width - PADDING * 2) * THUMB_RATIO);
    const thumb = new ThumbDoodle(
      width - PADDING * 2,
      this.thumbH,
      seed,
      this.accent,
    );
    thumb.setPosition(PADDING, PADDING);
    this.add(thumb);

    const titleY = PADDING + this.thumbH + 20;
    const titleText = new Text(creation.title, {
      font: FONT.display(15),
      color: COLOR.textPrimary,
      maxWidth: width - PADDING * 2,
    });
    titleText.setPosition(PADDING, titleY);
    this.add(titleText);

    const descY = titleY + titleText.height + 10;
    const descText = new Text(creation.description, {
      font: FONT.body(12),
      color: COLOR.textMuted,
      maxWidth: width - PADDING * 2,
    });
    clampTextToLines(descText, creation.description, 2);
    descText.setPosition(PADDING, descY);
    this.add(descText);

    this.tagsText = new Text(creation.tags.join("   ·   "), {
      font: FONT.mono(11),
      color: COLOR.textFaint,
    });
    this.add(this.tagsText);

    // Natural height; setUniformHeight may stretch it (tags stay bottom-anchored).
    this.setUniformHeight(descY + descText.height + 14 + 26 + PADDING);

    const badge = new PlayBadge(() => clamp01((this.baseY - this.y) / LIFT));
    badge.setPosition(this.width / 2, PADDING + this.thumbH / 2);
    this.add(badge);

    this.on("hover", () => {
      this.hovered = true;
      this.springTo({ y: this.baseY - LIFT });
    });
    this.on("pointerleave", () => {
      this.hovered = false;
      this.springTo({ y: this.baseY });
    });
    this.on("click", () => this.onOpen(this.creation));
  }

  /**
   * Sets the card's height (used by the grid to equalize a row) and re-anchors
   * the tag pill to the bottom edge, so stretched cards keep their footer flush
   * instead of leaving a hole under the description.
   */
  setUniformHeight(h: number): void {
    this.height = h;
    this.tagsText.setPosition(PADDING + 8, h - PADDING - 22 + 5);
  }

  // Bed positions the card after construction; capture that resting Y so the
  // hover spring lifts from (and returns to) the true laid-out position.
  override setPosition(x: number, y: number): this {
    this.baseY = y;
    return super.setPosition(x, y);
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

  override render(r: IRenderer): void {
    const t = clamp01((this.baseY - this.y) / LIFT);

    // Layered translucent roundRects fake the radial hover bloom the renderer
    // cannot draw directly; drawn first so the card body sits on top of it.
    if (t > 0.01) {
      const layers = 4;
      for (let i = layers; i >= 1; i--) {
        const spread = 6 + i * 5;
        r.setGlobalAlpha(0.05 * t);
        r.beginPath();
        r.roundRect(
          -spread,
          -spread,
          this.width + spread * 2,
          this.height + spread * 2,
          CARD_RADIUS + spread,
        );
        r.fill(this.accent.glow);
      }
      r.setGlobalAlpha(1);
    }

    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, CARD_RADIUS);
    r.fill(this.hovered ? COLOR.groundSunk : COLOR.groundRaised);
    r.stroke(t > 0.01 ? COLOR.ruleBright : COLOR.rule, 1);

    const barY = PADDING + this.thumbH + 8;
    const barGrad = r.createLinearGradient(
      PADDING,
      barY,
      this.width - PADDING,
      barY,
      [
        { stop: 0, color: this.accent.a },
        { stop: 1, color: this.accent.b },
      ],
    );
    r.beginPath();
    r.roundRect(PADDING, barY, this.width - PADDING * 2, 3, 1.5);
    r.fill(barGrad);

    const pillW = this.tagsText.width + 16;
    const pillY = this.height - PADDING - 22;
    r.beginPath();
    r.roundRect(PADDING, pillY, pillW, 22, 11);
    r.fill(COLOR.groundSunk);
  }
}
