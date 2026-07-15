import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { ThumbDoodle } from "./ThumbDoodle";
import { COLOR, FONT } from "./tokens";

const PADDING = 16;
const THUMB_HEIGHT = 92;
const CORNER_SIZE = 8;
const CORNER_INSET = 12;

export class CreationCard extends Entity {
  private hovered = false;
  private readonly titleText: Text;
  private readonly descText: Text;
  private readonly tagsText: Text;

  constructor(
    width: number,
    private readonly creation: Creation,
    seed: number,
    private readonly onOpen: (creation: Creation) => void,
  ) {
    super(`CreationCard:${creation.id}`);
    this.width = width;
    this.height = 0; // set below, once text heights are known
    this.interactive = true;

    const thumb = new ThumbDoodle(width - PADDING * 2, THUMB_HEIGHT, seed);
    thumb.setPosition(PADDING, PADDING);
    this.add(thumb);

    this.titleText = new Text(creation.title, {
      font: FONT.display(14),
      color: COLOR.textPrimary,
    });
    this.titleText.setPosition(PADDING, PADDING + THUMB_HEIGHT + 14);
    this.add(this.titleText);

    this.descText = new Text(creation.description, {
      font: FONT.body(12),
      color: COLOR.textMuted,
      maxWidth: width - PADDING * 2,
    });
    this.descText.setPosition(PADDING, PADDING + THUMB_HEIGHT + 36);
    this.add(this.descText);

    const tagsY = PADDING + THUMB_HEIGHT + 36 + this.descText.height + 10;
    this.tagsText = new Text(creation.tags.join("  ·  "), {
      font: FONT.mono(11),
      color: COLOR.textFaint,
    });
    this.tagsText.setPosition(PADDING, tagsY);
    this.add(this.tagsText);

    this.height = tagsY + 18 + PADDING;

    this.on("hover", () => {
      this.hovered = true;
    });
    this.on("pointerleave", () => {
      this.hovered = false;
    });
    this.on("click", () => this.onOpen(this.creation));
  }

  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(this.hovered ? COLOR.groundRaised : COLOR.ground);
    r.stroke(COLOR.rule, 1);

    // Corner registration mark, doubling as this card's accent.
    const cx = this.width - CORNER_INSET - CORNER_SIZE;
    const cy = CORNER_INSET;
    r.beginPath();
    r.moveTo(cx + CORNER_SIZE / 2, cy);
    r.lineTo(cx + CORNER_SIZE / 2, cy + CORNER_SIZE);
    r.moveTo(cx, cy + CORNER_SIZE / 2);
    r.lineTo(cx + CORNER_SIZE, cy + CORNER_SIZE / 2);
    r.stroke(COLOR.ink, 1.5);
  }
}
