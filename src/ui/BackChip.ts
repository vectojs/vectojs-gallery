import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";
import { COLOR, FONT } from "./tokens";

const PAD_X = 14;
const HEIGHT = 34;
const LABEL = "← Gallery";

/**
 * A floating light pill at the top-left of the workspace while a creation is
 * open. It is the theater frame's exit sign: creations stage themselves on a
 * dark backdrop (see Stage), and this chip keeps one always-visible, always-
 * clickable route back to the light catalog — without relying on the rail or
 * the browser's back button.
 */
export class BackChip extends Entity {
  private hovered = false;
  private readonly labelWidth: number;

  constructor(private readonly onBack: () => void) {
    super("BackChip");
    this.interactive = true;
    this.labelWidth = measureText(LABEL, FONT.body(13));
    this.width = this.labelWidth + PAD_X * 2;
    this.height = HEIGHT;

    this.on("hover", () => {
      this.hovered = true;
      this.scene?.markDirty();
    });
    this.on("pointerleave", () => {
      this.hovered = false;
      this.scene?.markDirty();
    });
    this.on("click", () => this.onBack());
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
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, HEIGHT / 2);
    r.fill(this.hovered ? "#ffffff" : "rgba(253, 252, 250, 0.92)");
    r.stroke(this.hovered ? COLOR.ink : COLOR.inkDim, 1);
    r.fillText(LABEL, PAD_X, 22, FONT.body(13), COLOR.textPrimary);
  }
}
