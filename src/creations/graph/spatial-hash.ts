/**
 * A minimal spatial hash grid for O(1)-average hover hit-testing over thousands of
 * graph nodes — the same technique described in the Mathematical Foundations doc's
 * "Spatial Hashing" section, applied here for real instead of just diagrammed.
 */
import type { GraphNode } from "./layout";

export class SpatialHash {
  private cellSize: number;
  private cells = new Map<number, number[]>(); // cellKey -> node indices
  private nodes: GraphNode[];

  constructor(nodes: GraphNode[], cellSize: number) {
    this.nodes = nodes;
    this.cellSize = cellSize;
    for (let i = 0; i < nodes.length; i++) {
      const key = this.keyFor(nodes[i].x, nodes[i].y);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private keyFor(x: number, y: number): number {
    // Pack two 16-bit-ish signed cell coordinates into one number key. World extent
    // here is a few thousand px, so cell coordinates comfortably fit in this range.
    const cx = this.cellCoord(x) + 32768;
    const cy = this.cellCoord(y) + 32768;
    return cx * 65536 + cy;
  }

  /** Nearest node to (x, y) within `maxDist` px, or null. Only tests the node's own
   * cell and its 8 neighbours — never the full node list. */
  nearest(x: number, y: number, maxDist: number): number | null {
    const cx = this.cellCoord(x);
    const cy = this.cellCoord(y);
    let best = -1;
    let bestD2 = maxDist * maxDist;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = this.keyForCell(cx + dx, cy + dy);
        const bucket = this.cells.get(key);
        if (!bucket) continue;
        for (const idx of bucket) {
          const n = this.nodes[idx];
          const ddx = n.x - x;
          const ddy = n.y - y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            best = idx;
          }
        }
      }
    }
    return best === -1 ? null : best;
  }

  private keyForCell(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
}
