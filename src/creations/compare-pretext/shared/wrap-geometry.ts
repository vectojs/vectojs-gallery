/**
 * Pure wrap geometry for the obstacle-routing demos (dynamic-layout,
 * editorial-engine). Ported from pretext's `wrap-geometry.ts` — interval
 * carving, per-band intervals for rect / circle / polygon obstacles, a
 * point-in-polygon hit test, and an affine transform for rotating a
 * normalized hull into place. All pure functions; no DOM, no measurement.
 */

export interface Interval {
  left: number;
  right: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

/**
 * Given one allowed horizontal interval and a set of blocked intervals, carve
 * out the remaining usable text slots for one line band, discarding slivers
 * narrower than `minSlot`.
 */
export function carveTextLineSlots(
  base: Interval,
  blocked: Interval[],
  minSlot = 24,
): Interval[] {
  let slots: Interval[] = [base];
  for (const interval of blocked) {
    const next: Interval[] = [];
    for (const slot of slots) {
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }
      if (interval.left > slot.left)
        next.push({ left: slot.left, right: interval.left });
      if (interval.right < slot.right)
        next.push({ left: interval.right, right: slot.right });
    }
    slots = next;
  }
  return slots.filter((s) => s.right - s.left >= minSlot);
}

/** Blocked horizontal interval of a circle across a vertical line band. */
export function circleIntervalForBand(
  cx: number,
  cy: number,
  r: number,
  bandTop: number,
  bandBottom: number,
  hPad: number,
  vPad: number,
): Interval | null {
  const top = bandTop - vPad;
  const bottom = bandBottom + vPad;
  if (top >= cy + r || bottom <= cy - r) return null;
  const minDy =
    cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom;
  if (minDy >= r) return null;
  const maxDx = Math.sqrt(r * r - minDy * minDy);
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad };
}

/** Blocked intervals of a set of rects across a vertical line band. */
export function rectIntervalsForBand(
  rects: Rect[],
  bandTop: number,
  bandBottom: number,
  hPad: number,
  vPad: number,
): Interval[] {
  const intervals: Interval[] = [];
  for (const rect of rects) {
    if (bandBottom <= rect.y - vPad || bandTop >= rect.y + rect.height + vPad)
      continue;
    intervals.push({ left: rect.x - hPad, right: rect.x + rect.width + hPad });
  }
  return intervals;
}

/** Blocked interval of a polygon hull across a vertical line band (scanline union). */
export function polygonIntervalForBand(
  points: Point[],
  bandTop: number,
  bandBottom: number,
  hPad: number,
  vPad: number,
): Interval | null {
  const startY = Math.floor(bandTop - vPad);
  const endY = Math.ceil(bandBottom + vPad);
  let left = Infinity;
  let right = -Infinity;
  for (let y = startY; y <= endY; y++) {
    const xs = polygonXsAtY(points, y + 0.5);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i] < left) left = xs[i];
      if (xs[i + 1] > right) right = xs[i + 1];
    }
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { left: left - hPad, right: right + hPad };
}

export function isPointInPolygon(
  points: Point[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, prev = points.length - 1; i < points.length; prev = i++) {
    const a = points[i];
    const b = points[prev];
    const intersects =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Transform a normalized [0,1] hull into a rect, rotated by `angle` about its center. */
export function transformWrapPoints(
  points: Point[],
  rect: Rect,
  angle: number,
): Point[] {
  if (angle === 0) {
    return points.map((p) => ({
      x: rect.x + p.x * rect.width,
      y: rect.y + p.y * rect.height,
    }));
  }
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => {
    const lx = (p.x - 0.5) * rect.width;
    const ly = (p.y - 0.5) * rect.height;
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
  });
}

function polygonXsAtY(points: Point[], y: number): number[] {
  const xs: number[] = [];
  let a = points[points.length - 1];
  if (!a) return xs;
  for (const b of points) {
    if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) {
      xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    a = b;
  }
  xs.sort((m, n) => m - n);
  return xs;
}

/** A regular n-gon hull normalized to [0,1]², for use as an abstract obstacle. */
export function regularPolygonHull(sides: number, rotation = 0): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) });
  }
  return pts;
}
