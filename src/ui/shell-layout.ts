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
