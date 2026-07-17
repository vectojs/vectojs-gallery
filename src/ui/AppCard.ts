import { Entity, type IRenderer } from "@vectojs/core";
import { Image, Text } from "@vectojs/ui";
import type { ForgeApp } from "../apps";
import { displayUrl } from "../apps";
import { clampTextToLines } from "./clamp";
import { COLOR, FONT } from "./tokens";

const PADDING = 14;
const CARD_RADIUS = 14;
const LIFT = 8;
const SHOT_RATIO = 9 / 16;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * A "Built on VectoJS" card: live-deployment screenshot, app name, canonical
 * domain, and a short tagline. The whole card is clickable and opens the
 * app's canonical URL in a new tab — forge apps are linked, never embedded.
 * Shares CreationCard's hover language (spring lift + accent glow) so the two
 * tiers read as one family.
 */
export class AppCard extends Entity {
  private hovered = false;
  private baseY = 0;
  private readonly shotH: number;
  private readonly urlText: Text;

  constructor(
    width: number,
    private readonly app: ForgeApp,
    onLoad: () => void,
  ) {
    super(`AppCard:${app.id}`);
    this.width = width;
    this.interactive = true;

    const shotW = width - PADDING * 2;
    this.shotH = Math.round(shotW * SHOT_RATIO);
    const shot = new Image(app.screenshot, {
      width: shotW,
      height: this.shotH,
      alt: `${app.name} screenshot`,
      placeholder: COLOR.groundSunk,
      radius: 8,
      onLoad,
    });
    shot.setPosition(PADDING, PADDING);
    this.add(shot);

    const nameY = PADDING + this.shotH + 16;
    const name = new Text(app.name, {
      font: FONT.display(16),
      color: COLOR.textPrimary,
    });
    name.setPosition(PADDING, nameY);
    this.add(name);

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

    this.height = nameY + name.height + 8 + tagline.height + PADDING + 4;

    this.on("hover", () => {
      this.hovered = true;
      this.springTo({ y: this.baseY - LIFT });
    });
    this.on("pointerleave", () => {
      this.hovered = false;
      this.springTo({ y: this.baseY });
    });
    this.on("click", () => {
      window.open(this.app.url, "_blank", "noopener,noreferrer");
    });
  }

  /** See CreationCard.setPosition — capture the laid-out Y as the spring's rest. */
  override setPosition(x: number, y: number): this {
    this.baseY = y;
    return super.setPosition(x, y);
  }

  /** Bottom-aligns metadata when the grid stretches this card taller than natural. */
  setUniformHeight(h: number): void {
    this.height = h;
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
        r.fill(this.app.accent.glow);
      }
      r.setGlobalAlpha(1);
    }

    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, CARD_RADIUS);
    r.fill(this.hovered ? COLOR.groundSunk : COLOR.groundRaised);
    r.stroke(t > 0.01 ? COLOR.ruleBright : COLOR.rule, 1);

    // Hairline frame over the screenshot so light app UIs don't bleed into
    // the card ground, plus the accent rule under it (family trait shared
    // with CreationCard).
    r.beginPath();
    r.roundRect(PADDING, PADDING, this.width - PADDING * 2, this.shotH, 8);
    r.stroke(COLOR.rule, 1);

    const barY = PADDING + this.shotH + 6;
    const barGrad = r.createLinearGradient(
      PADDING,
      barY,
      this.width - PADDING,
      barY,
      [
        { stop: 0, color: this.app.accent.a },
        { stop: 1, color: this.app.accent.b },
      ],
    );
    r.beginPath();
    r.roundRect(PADDING, barY, this.width - PADDING * 2, 3, 1.5);
    r.fill(barGrad);
  }
}
