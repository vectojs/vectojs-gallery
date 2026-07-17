import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { COLOR, FONT } from "./tokens";

const PADDING = 18;
const MAX_WIDTH = 560;
const COLLAPSED_SIZE = 40;
const AUTO_COLLAPSE_MS = 4000;

/**
 * Floating overlay shown at the bottom-left of the workspace while a
 * creation is open. Auto-collapses to a small dismissible tab after a
 * few seconds so it doesn't permanently block bottom-anchored content
 * some creations draw there (e.g. Fruit Catch's paddle) — expands again
 * on hover/click. Anchors to a caller-supplied bottom Y (see
 * `setBottomAnchor`) rather than a fixed `y`, since collapsing/expanding
 * changes its own height.
 */
export class CaptionPlate extends Entity {
  private readonly expandedWidth = MAX_WIDTH;
  private readonly expandedHeight: number;
  private collapsed = false;
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private bottomY = 0;
  private readonly titleText: Text;
  private readonly descText: Text;
  private readonly tagsText: Text;

  constructor(creation: Creation) {
    super("CaptionPlate");
    this.interactive = true;
    this.width = MAX_WIDTH;

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
    this.height = this.expandedHeight;
    this.showContent();

    this.on("hover", () => this.expand());
    this.on("click", () => this.expand());
    this.on("pointerleave", () => this.scheduleCollapse());

    this.scheduleCollapse();
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

  // Cancels any pending auto-collapse (does not reschedule one — only
  // `pointerleave` does that, so staying hovered keeps this expanded
  // indefinitely instead of re-collapsing out from under the cursor).
  private expand(): void {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
    if (!this.collapsed) return;
    this.collapsed = false;
    this.width = this.expandedWidth;
    this.height = this.expandedHeight;
    this.y = this.bottomY - this.height;
    this.showContent();
  }

  private scheduleCollapse(): void {
    if (this.collapseTimer) clearTimeout(this.collapseTimer);
    this.collapseTimer = setTimeout(() => {
      this.collapsed = true;
      this.width = COLLAPSED_SIZE;
      this.height = COLLAPSED_SIZE;
      this.y = this.bottomY - this.height;
      this.hideContent();
    }, AUTO_COLLAPSE_MS);
  }

  override destroy(): void {
    if (this.collapseTimer) clearTimeout(this.collapseTimer);
    super.destroy();
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
    }
  }
}
