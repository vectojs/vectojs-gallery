import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";
import { COLOR, FONT } from "./tokens";

const CARD_RADIUS = 14;
const DASH = 6;
const GAP = 5;
const REPO_URL = "https://github.com/vectojs/vectojs-gallery";

/**
 * The last cell of the creations grid: a dashed "Submit your creation" invite
 * linking to the repository's PR guide. Turns leftover grid space into the
 * community growth loop instead of dead ground.
 */
export class SubmitCard extends Entity {
  private hovered = false;

  constructor(width: number, height: number) {
    super("SubmitCard");
    this.width = width;
    this.height = height;
    this.interactive = true;

    this.on("hover", () => {
      this.hovered = true;
    });
    this.on("pointerleave", () => {
      this.hovered = false;
    });
    this.on("click", () => {
      window.open(REPO_URL, "_blank", "noopener,noreferrer");
    });
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

  /** Dashed line from (x1,y1) toward (x2,y2) — the renderer has no dash API. */
  private dashedLine(
    r: IRenderer,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
  ): void {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let d = 0; d + DASH <= len; d += DASH + GAP) {
      r.beginPath();
      r.moveTo(x1 + ux * d, y1 + uy * d);
      r.lineTo(x1 + ux * (d + DASH), y1 + uy * (d + DASH));
      r.stroke(color, 1.5);
    }
  }

  override render(r: IRenderer): void {
    if (this.hovered) {
      r.beginPath();
      r.roundRect(0, 0, this.width, this.height, CARD_RADIUS);
      r.fill(COLOR.groundRaised);
    }

    const edge = this.hovered ? COLOR.inkDim : COLOR.ruleBright;
    const inset = CARD_RADIUS;
    this.dashedLine(r, inset, 0, this.width - inset, 0, edge);
    this.dashedLine(
      r,
      inset,
      this.height,
      this.width - inset,
      this.height,
      edge,
    );
    this.dashedLine(r, 0, inset, 0, this.height - inset, edge);
    this.dashedLine(
      r,
      this.width,
      inset,
      this.width,
      this.height - inset,
      edge,
    );

    const cx = this.width / 2;
    const cy = this.height / 2;
    r.fillText("+", cx - 11, cy - 18, FONT.display(34), COLOR.ink);
    const title = "Submit your creation";
    r.fillText(
      title,
      cx - measureText(title, FONT.display(14)) / 2,
      cy + 22,
      FONT.display(14),
      COLOR.textPrimary,
    );
    const sub = "One Entity per file, PR-based — read the guide ↗";
    r.fillText(
      sub,
      cx - measureText(sub, FONT.body(11)) / 2,
      cy + 44,
      FONT.body(11),
      COLOR.textFaint,
    );
  }
}
