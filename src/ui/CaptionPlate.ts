import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { COLOR, FONT } from "./tokens";

const PADDING = 18;
const MAX_WIDTH = 560;

/** Floating overlay shown at the bottom-left of the workspace while a creation is open. */
export class CaptionPlate extends Entity {
  private titleText: Text;
  private descText: Text;
  private tagsText: Text;

  constructor(creation: Creation) {
    super("CaptionPlate");
    this.width = MAX_WIDTH;

    this.titleText = new Text(creation.title, {
      font: FONT.display(18),
      color: COLOR.textPrimary,
    });
    this.titleText.setPosition(PADDING, PADDING + 14);
    this.add(this.titleText);

    this.descText = new Text(creation.description, {
      font: FONT.body(13),
      color: COLOR.textMuted,
      maxWidth: MAX_WIDTH - PADDING * 2,
    });
    this.descText.setPosition(PADDING, PADDING + 40);
    this.add(this.descText);

    this.tagsText = new Text(creation.tags.join("  ·  "), {
      font: FONT.mono(11),
      color: COLOR.ink,
    });
    this.tagsText.setPosition(
      PADDING,
      PADDING + 40 + this.descText.height + 12,
    );
    this.add(this.tagsText);

    this.height = PADDING + 40 + this.descText.height + 12 + 20 + PADDING;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("rgba(18, 21, 27, 0.82)");
    r.stroke(COLOR.inkDim, 1);
  }
}
