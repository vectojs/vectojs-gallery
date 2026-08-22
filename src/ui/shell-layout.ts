export const FULL_RAIL_WIDTH = 280;
export const COLLAPSED_RAIL_WIDTH = 56;
export const COMPACT_NAV_HEIGHT = 64;

export type ShellMode = 'compact' | 'medium' | 'wide';

export interface ShellLayout {
  mode: ShellMode;
  railX: number;
  railY: number;
  railWidth: number;
  railHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

export function shellMode(width: number): ShellMode {
  if (width < 768) return 'compact';
  if (width < 1440) return 'medium';
  return 'wide';
}

export function railCollapsedForView(mode: ShellMode, creationOpen: boolean): boolean {
  return mode === 'medium' && !creationOpen;
}

/**
 * Where an open creation's `← Gallery` chip belongs, as `[x, y]`.
 *
 * Compact navigation owns the top {@link COMPACT_NAV_HEIGHT} band, and in that
 * mode `contentY` is *below* it — so anchoring the chip to the content origin
 * pushes it off a short viewport. Wide and medium keep it inside the content
 * band, where the rail already occupies the left edge.
 *
 * A function rather than an inline expression because it had three callers that
 * silently disagreed: the mount path, the rail-collapse reflow, and the window
 * `resize` path, which omitted the chip altogether. A window dragged from wide to
 * compact therefore stranded it at the wide `contentX` — measured 296px at a
 * 390px viewport — while everything else reflowed around it.
 */
export function backChipPosition(layout: ShellLayout, inset = 16): [number, number] {
  return [layout.contentX + inset, layout.mode === 'compact' ? inset : layout.contentY + inset];
}

export function getShellLayout(
  width: number,
  height: number,
  mode = shellMode(width),
  railCollapsed = mode === 'medium',
): ShellLayout {
  if (mode === 'compact') {
    return {
      mode,
      railX: 0,
      railY: 0,
      railWidth: width,
      railHeight: Math.min(COMPACT_NAV_HEIGHT, height),
      contentX: 0,
      contentY: Math.min(COMPACT_NAV_HEIGHT, height),
      contentWidth: width,
      contentHeight: Math.max(0, height - Math.min(COMPACT_NAV_HEIGHT, height)),
    };
  }

  const railWidth = railCollapsed ? COLLAPSED_RAIL_WIDTH : FULL_RAIL_WIDTH;
  return {
    mode,
    railX: 0,
    railY: 0,
    railWidth,
    railHeight: height,
    contentX: railWidth,
    contentY: 0,
    contentWidth: Math.max(0, width - railWidth),
    contentHeight: height,
  };
}
