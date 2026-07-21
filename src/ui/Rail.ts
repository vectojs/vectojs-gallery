import { Entity, type IRenderer } from "@vectojs/core";
import { Button, Stack, Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import type { ForgeApp } from "../apps";
import { COLOR, FONT, BRAND_GRADIENT } from "./tokens";

const TILE = 40;
const TILE_X = 20;
const TILE_Y = 20;
const CONTENT_TOP = 84;
/** Width of the rail when collapsed to just the brand tile + expand button. */
export const COLLAPSED_RAIL_WIDTH = 56;

/** Small uppercase group label used between the rail's nav sections. */
function groupLabel(text: string): Text {
  return new Text(text.toUpperCase(), {
    font: FONT.mono(10),
    color: COLOR.textFaint,
  });
}

export class Rail extends Entity {
  private readonly root: Stack;
  private readonly toggleBtn: Button;
  private collapsed = false;
  private readonly fullWidth: number;

  constructor(
    width: number,
    height: number,
    creations: Creation[],
    apps: ForgeApp[],
    private readonly onOpen: (creation: Creation) => void,
    private readonly onToggleCollapse: (collapsed: boolean) => void,
  ) {
    super("Rail");
    this.width = width;
    this.height = height;
    this.fullWidth = width;

    const root = new Stack({ direction: "vertical", gap: 16 });
    root.setPosition(20, CONTENT_TOP);
    this.add(root);
    this.root = root;

    // Creations — the catalog is intentionally small, so the list is shown in
    // full with no search field or tag filter (removed 2026-07-21): both were
    // dead weight for a handful of entries.
    root.add(groupLabel("Creations"));
    const listStack = new Stack({ direction: "vertical", gap: 4 });
    for (const creation of creations) {
      listStack.add(
        new Button(creation.title, {
          font: FONT.body(13),
          bg: "transparent",
          color: COLOR.textPrimary,
          padding: 8,
          radius: 8,
          onClick: () => this.onOpen(creation),
        }),
      );
    }
    root.add(listStack);

    root.add(groupLabel("Built on VectoJS"));
    const appsStack = new Stack({ direction: "vertical", gap: 4 });
    for (const app of apps) {
      appsStack.add(
        new Button(`${app.name} ↗`, {
          font: FONT.body(13),
          bg: "transparent",
          color: COLOR.textPrimary,
          padding: 8,
          radius: 8,
          onClick: () => window.open(app.url, "_blank", "noopener,noreferrer"),
        }),
      );
    }
    root.add(appsStack);
    root.layout();

    // Collapse / expand toggle. Added directly (not in the scrolling list) so
    // it stays pinned; its label + position flip with the collapsed state.
    this.toggleBtn = new Button("«", {
      font: FONT.display(15),
      bg: COLOR.groundSunk,
      color: COLOR.textMuted,
      padding: 6,
      radius: 8,
      onClick: () => this.toggle(),
    });
    this.add(this.toggleBtn);
    this.positionToggle();
  }

  private positionToggle(): void {
    if (this.collapsed) {
      // Below the brand tile, centered in the narrow strip.
      this.toggleBtn.setPosition(TILE_X - 6, TILE_Y + TILE + 12);
    } else {
      // Top-right corner of the full rail.
      this.toggleBtn.setPosition(this.fullWidth - 40, TILE_Y + 6);
    }
  }

  private toggle(): void {
    this.setCollapsed(!this.collapsed);
    this.onToggleCollapse(this.collapsed);
  }

  /** Collapses to a thin brand strip (hides the nav) or restores the full rail. */
  setCollapsed(collapsed: boolean): void {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    this.width = collapsed ? COLLAPSED_RAIL_WIDTH : this.fullWidth;
    if (collapsed) this.remove(this.root);
    else this.add(this.root);
    this.toggleBtn.label = collapsed ? "»" : "«";
    this.positionToggle();
    this.scene?.markDirty();
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.groundRaised);
    r.stroke(COLOR.rule, 1);

    const tileGrad = r.createLinearGradient(
      TILE_X,
      TILE_Y,
      TILE_X + TILE,
      TILE_Y + TILE,
      [
        { stop: 0, color: BRAND_GRADIENT.a },
        { stop: 1, color: BRAND_GRADIENT.b },
      ],
    );
    r.beginPath();
    r.roundRect(TILE_X, TILE_Y, TILE, TILE, 11);
    r.fill(tileGrad);
    r.fillText("V", TILE_X + 12, TILE_Y + 29, FONT.display(22), COLOR.void);

    // The brand word-mark is only drawn when there's room for it.
    if (this.collapsed) return;
    const textX = TILE_X + TILE + 14;
    r.fillText(
      "Gallery",
      textX,
      TILE_Y + 18,
      FONT.display(18),
      COLOR.textPrimary,
    );
    r.fillText(
      "VECTOJS · CANVAS-NATIVE",
      textX,
      TILE_Y + 35,
      FONT.mono(9),
      COLOR.textFaint,
    );
  }
}
