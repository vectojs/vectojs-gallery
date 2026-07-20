/**
 * A reusable pool of `Text` entities for demos that compute their own per-line
 * positions (obstacle routing, columns, justification) but still want native
 * text selection + find-in-page. Raw `IRenderer.fillText` paints pixels that
 * project nothing selectable; a real `Text` child projects a transparent,
 * position-synced content `div` the browser can select and copy (see
 * `Text.getContentProjection`). This pool lets a demo re-drive N positioned
 * lines every layout without allocating/GC-ing a `Text` per frame: unused
 * lines are parked off-screen and reused on the next pass.
 */
import { Entity } from "@vectojs/core";
import { Text } from "@vectojs/ui";

export interface PooledLine {
  x: number;
  y: number;
  text: string;
  font: string;
  color: string;
  /** Baseline nudge already applied by the demo; the Text sits at y directly. */
  lineHeight?: number;
}

export class LinePool extends Entity {
  private pool: Text[] = [];
  private mounted = 0;

  constructor(name = "LinePool") {
    super(name);
  }

  isPointInside(): boolean {
    return false;
  }

  render(): void {
    // Children (Text entities) draw + project themselves.
  }

  /** Replace the visible line set. Reuses existing Text children in order. */
  setLines(lines: PooledLine[]): void {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let t = this.pool[i];
      if (!t) {
        t = new Text(l.text, {
          font: l.font,
          color: l.color,
          lineHeight: l.lineHeight ?? 20,
          selectable: true,
        });
        this.pool[i] = t;
      } else if (t.text !== l.text) {
        // Text.setText re-measures (cold) only when the string changed.
        t.setText(l.text);
      }
      t.font = l.font;
      t.color = l.color;
      if (l.lineHeight !== undefined) t.lineHeight = l.lineHeight;
      t.setPosition(l.x, l.y);
      if (i >= this.mounted) this.add(t);
    }
    // Unmount any leftover pooled lines so they don't project selectable text.
    for (let i = lines.length; i < this.mounted; i++) {
      this.remove(this.pool[i]);
    }
    this.mounted = lines.length;
  }

  get count(): number {
    return this.mounted;
  }
}
