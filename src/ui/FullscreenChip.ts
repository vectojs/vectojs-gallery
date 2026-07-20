import { Entity, type IRenderer, type A11yAttributes } from "@vectojs/core";
import { COLOR, FONT } from "./tokens";

const SIZE = 34;

/**
 * A floating square toggle at the top-right of the workspace while a creation
 * is open. Enlarges the creation to the full window width by hiding the Rail —
 * useful for wide/dense creations (e.g. compare-pretext) whose left edge would
 * otherwise sit behind the catalog rail. Sits in the theater frame beside the
 * BackChip.
 */
export class FullscreenChip extends Entity {
  private hovered = false;
  private active = false;

  constructor(private readonly onToggle: (full: boolean) => void) {
    super("FullscreenChip");
    this.interactive = true;
    this.width = SIZE;
    this.height = SIZE;

    this.on("hover", () => {
      this.hovered = true;
      this.scene?.markDirty();
    });
    this.on("pointerleave", () => {
      this.hovered = false;
      this.scene?.markDirty();
    });
    this.on("click", () => {
      this.active = !this.active;
      this.onToggle(this.active);
      this.scene?.markDirty();
    });
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      role: "button",
      label: this.active ? "Exit full width" : "Expand to full width",
    };
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
    r.roundRect(0, 0, SIZE, SIZE, 9);
    r.fill(this.hovered ? "#ffffff" : "rgba(253, 252, 250, 0.92)");
    r.stroke(this.hovered ? COLOR.ink : COLOR.inkDim, 1);
    // Diagonal double-arrow: expand when collapsed, collapse when full.
    r.fillText(
      this.active ? "⤡" : "⤢",
      8,
      24,
      FONT.body(16),
      COLOR.textPrimary,
    );
  }
}
