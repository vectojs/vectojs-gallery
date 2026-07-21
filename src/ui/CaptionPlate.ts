import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { COLOR, FONT } from "./tokens";

const PADDING = 18;
const MAX_WIDTH = 560;
const COLLAPSED_SIZE = 40;
const CLOSE_SIZE = 22; // hit box of the "x" button in the expanded plate

/**
 * Floating help overlay at the bottom-left of the workspace while a creation
 * is open. Starts COLLAPSED (a small "i" tab) so it never blocks a creation's
 * own interactive chrome on entry — the user opts in to reading it by hovering
 * or clicking the tab, and dismisses it again with the explicit "x" button in
 * the expanded card's top-right corner. Anchors to a caller-supplied bottom Y
 * (see `setBottomAnchor`) rather than a fixed `y`, since expanding/collapsing
 * changes its own height.
 */
export class CaptionPlate extends Entity {
  private readonly expandedWidth = MAX_WIDTH;
  private readonly expandedHeight: number;
  // Start collapsed: help is hidden by default and blocks nothing.
  private collapsed = true;
  private bottomY = 0;
  private readonly titleText: Text;
  private readonly descText: Text;
  private readonly tagsText: Text;

  constructor(creation: Creation) {
    super("CaptionPlate");
    this.interactive = true;
    this.width = COLLAPSED_SIZE;
    this.height = COLLAPSED_SIZE;

    this.titleText = new Text(creation.title, {
      font: FONT.display(18),
      color: COLOR.textPrimary,
    });
    this.titleText.setPosition(PADDING, PADDING + 14);

    this.descText = new Text(creation.description, {
      font: FONT.body(13),
      color: COLOR.textMuted,
      maxWidth: MAX_WIDTH - PADDING * 2,
    });
    this.descText.setPosition(PADDING, PADDING + 40);

    this.tagsText = new Text(creation.tags.join("  ·  "), {
      font: FONT.mono(11),
      color: COLOR.ink,
    });
    this.tagsText.setPosition(
      PADDING,
      PADDING + 40 + this.descText.height + 12,
    );

    this.expandedHeight =
      PADDING + 40 + this.descText.height + 12 + 20 + PADDING;

    // Hover the collapsed tab to peek; click routes to expand-or-close so the
    // "x" hit box can dismiss it (see onClick).
    this.on("hover", () => this.expand());
    this.on("click", (e: { localX?: number; localY?: number }) =>
      this.onClick(e.localX ?? 0, e.localY ?? 0),
    );
  }

  /** Sets the fixed bottom Y this plate's bottom edge tracks as its height changes. */
  setBottomAnchor(bottomY: number): void {
    this.bottomY = bottomY;
    this.y = this.bottomY - this.height;
  }

  private showContent(): void {
    this.add(this.titleText);
    this.add(this.descText);
    this.add(this.tagsText);
  }

  private hideContent(): void {
    this.remove(this.titleText);
    this.remove(this.descText);
    this.remove(this.tagsText);
  }

  // Top-right "x" hit box in the expanded plate's local space.
  private inCloseButton(localX: number, localY: number): boolean {
    if (this.collapsed) return false;
    const x0 = this.width - PADDING - CLOSE_SIZE;
    const y0 = PADDING - 4;
    return (
      localX >= x0 &&
      localX <= x0 + CLOSE_SIZE &&
      localY >= y0 &&
      localY <= y0 + CLOSE_SIZE
    );
  }

  private onClick(localX: number, localY: number): void {
    if (!this.collapsed && this.inCloseButton(localX, localY)) this.collapse();
    else this.expand();
  }

  private expand(): void {
    if (!this.collapsed) return;
    this.collapsed = false;
    this.width = this.expandedWidth;
    this.height = this.expandedHeight;
    this.y = this.bottomY - this.height;
    this.showContent();
    this.scene?.markDirty();
  }

  private collapse(): void {
    if (this.collapsed) return;
    this.collapsed = true;
    this.width = COLLAPSED_SIZE;
    this.height = COLLAPSED_SIZE;
    this.y = this.bottomY - this.height;
    this.hideContent();
    this.scene?.markDirty();
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
    r.roundRect(
      0,
      0,
      this.width,
      this.height,
      this.collapsed ? this.width / 2 : 0,
    );
    r.fill("rgba(253, 252, 250, 0.92)");
    r.stroke(COLOR.inkDim, 1);

    if (this.collapsed) {
      r.fillText(
        "i",
        this.width / 2 - 3,
        this.height / 2 + 5,
        FONT.display(14),
        COLOR.ink,
      );
      return;
    }

    // Expanded: draw the "x" close button in the top-right corner.
    const cx = this.width - PADDING - CLOSE_SIZE / 2;
    const cy = PADDING - 4 + CLOSE_SIZE / 2;
    r.beginPath();
    r.arc(cx, cy, CLOSE_SIZE / 2, 0, Math.PI * 2);
    r.fill(COLOR.groundSunk);
    const arm = 4;
    r.beginPath();
    r.moveTo(cx - arm, cy - arm);
    r.lineTo(cx + arm, cy + arm);
    r.moveTo(cx + arm, cy - arm);
    r.lineTo(cx - arm, cy + arm);
    r.stroke(COLOR.textMuted, 1.5);
  }
}
