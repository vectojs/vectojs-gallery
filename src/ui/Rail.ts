import { Entity, type IRenderer } from '@vectojs/core';
import { Button, Image, Stack, Text } from '@vectojs/ui';
import type { Creation } from '../registry';
import type { ForgeApp } from '../apps';
import { COLOR, FONT } from './tokens';

const TILE = 40;
const TILE_X = 20;
const TILE_Y = 20;
/**
 * The canonical bow mark, served same-origin from `public/`.
 *
 * A byte-for-byte copy of `cdn.vectojs.org/brand/vectojs-logo-light.svg`, held
 * locally on purpose: `@vectojs/ui`'s `Image` never sets `crossOrigin`, so a
 * cross-origin bitmap taints this canvas the moment it is drawn, and every later
 * `getImageData` / `toDataURL` / `toBlob` on it throws `SecurityError`. Nothing
 * in the shell reads pixels back today, but a same-origin copy keeps that door
 * open for a canvas snapshot or pixel probe. Re-sync it if the artwork changes.
 *
 * The `-light` variant is the near-black artwork, which is the one that reads on
 * this rail. Deliberately NOT `public/favicon.svg`: that file carries a
 * `prefers-color-scheme` rule which an `<img>`-loaded SVG honors, so it would
 * flip to near-white on a dark OS and vanish against the warm cream rail. The
 * rail has no dark theme, so a single baked-color variant is correct here.
 */
const LOGO_SRC = '/vectojs-logo.svg';
/** Artwork aspect ratio (viewBox 697x507), so the mark is never stretched. */
const LOGO_W = 38;
const LOGO_H = 28;
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
  private compact = false;
  private compactOpen = false;
  private compactViewportHeight = 0;
  private readonly fullWidth: number;

  constructor(
    width: number,
    height: number,
    creations: Creation[],
    apps: ForgeApp[],
    private readonly onOpen: (creation: Creation) => void,
    private readonly onToggleCollapse: (collapsed: boolean) => void,
  ) {
    super('Rail');
    this.width = width;
    this.height = height;
    this.fullWidth = width;

    // Centred in the old tile's box so the surrounding layout is untouched.
    const logo = new Image(LOGO_SRC, {
      width: LOGO_W,
      height: LOGO_H,
      alt: 'VectoJS',
      placeholder: 'transparent',
      // The catalog shell runs `renderMode: 'always'`, but a creation switches
      // it to `onDemand`; without this the mark would stay a blank box until
      // something else happened to dirty the scene.
      onLoad: () => this.scene?.markDirty(),
    });
    logo.setPosition(TILE_X + (TILE - LOGO_W) / 2, TILE_Y + (TILE - LOGO_H) / 2);
    this.add(logo);

    const root = new Stack({ direction: 'vertical', gap: 16 });
    root.setPosition(20, CONTENT_TOP);
    this.add(root);
    this.root = root;

    // Creations — the catalog is intentionally small, so the list is shown in
    // full with no search field or tag filter (removed 2026-07-21): both were
    // dead weight for a handful of entries.
    root.add(groupLabel('Creations'));
    const listStack = new Stack({ direction: 'vertical', gap: 4 });
    for (const creation of creations) {
      listStack.add(
        new Button(creation.title, {
          font: FONT.body(13),
          bg: 'transparent',
          color: COLOR.textPrimary,
          padding: 8,
          radius: 8,
          onClick: () => this.onOpen(creation),
        }),
      );
    }
    root.add(listStack);

    root.add(groupLabel('Built on VectoJS'));
    const appsStack = new Stack({ direction: 'vertical', gap: 4 });
    for (const app of apps) {
      appsStack.add(
        new Button(`${app.name} ↗`, {
          font: FONT.body(13),
          bg: 'transparent',
          color: COLOR.textPrimary,
          padding: 8,
          radius: 8,
          onClick: () => window.open(app.url, '_blank', 'noopener,noreferrer'),
        }),
      );
    }
    root.add(appsStack);
    root.layout();

    // Collapse / expand toggle. Added directly (not in the scrolling list) so
    // it stays pinned; its label + position flip with the collapsed state.
    this.toggleBtn = new Button('«', {
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
    if (this.compact) {
      this.compactOpen = !this.compactOpen;
      this.height = this.compactOpen ? this.compactViewportHeight : 64;
      if (this.compactOpen) this.add(this.root);
      else this.remove(this.root);
      this.toggleBtn.label = this.compactOpen ? 'Close' : 'Menu';
      this.scene?.markDirty();
      return;
    }
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
    this.toggleBtn.label = collapsed ? '»' : '«';
    this.positionToggle();
    this.scene?.markDirty();
  }

  setCompact(compact: boolean, width: number, viewportHeight: number): void {
    if (this.compact !== compact) this.compactOpen = false;
    this.compact = compact;
    this.compactViewportHeight = viewportHeight;
    this.width = compact ? width : this.collapsed ? COLLAPSED_RAIL_WIDTH : this.fullWidth;
    this.height = compact && !this.compactOpen ? 64 : viewportHeight;
    if (compact && !this.compactOpen) this.remove(this.root);
    else if (!compact && this.collapsed) this.remove(this.root);
    else if (!this.root.parent) this.add(this.root);
    this.toggleBtn.opacity = 1;
    if (compact) {
      this.toggleBtn.label = this.compactOpen ? 'Close' : 'Menu';
      this.toggleBtn.setPosition(width - 72, 16);
    } else this.positionToggle();
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

    // The mark itself is an `Image` child (added in the constructor) so it
    // projects a real `<img alt>` shadow node; nothing is drawn for it here.

    // The brand word-mark is only drawn when there's room for it.
    if (this.collapsed && !this.compact) return;
    const textX = TILE_X + TILE + 14;
    r.fillText('Gallery', textX, TILE_Y + 18, FONT.display(18), COLOR.textPrimary);
    r.fillText('VECTOJS · CANVAS-NATIVE', textX, TILE_Y + 35, FONT.mono(9), COLOR.textFaint);
  }
}
