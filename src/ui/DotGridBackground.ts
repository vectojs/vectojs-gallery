import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";
import { COLOR, FONT, type Accent } from "./tokens";

const DOT_SPACING = 26;
const MASTHEAD_X = 24;
const MASTHEAD_Y = 30;
const BRAND: Accent = { a: "#7c5cff", b: "#22d3ee", glow: "#7c5cff" };

/**
 * The catalog "bed" surface: solid ground fill, a very faint dot grid, two
 * corner ambient blooms, and a masthead. It sits behind the cards (which paint
 * from PADDING=24 downward), so the masthead is deliberately low-contrast far
 * background — legible in the margins, never competing with card content.
 * `isPointInside` always returns false so it never steals clicks from the cards.
 */
export class DotGridBackground extends Entity {
  constructor(width: number, height: number) {
    super("DotGridBackground");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  /**
   * Fakes a radial bloom the linear-gradient-only renderer cannot draw: a few
   * concentric arcs painted at low alpha in the accent colour, densest at the
   * centre. Alpha is always restored to 1 so later draws are unaffected.
   */
  private drawBloom(
    r: IRenderer,
    x: number,
    y: number,
    radius: number,
    color: string,
  ): void {
    const layers = 5;
    for (let i = layers; i >= 1; i--) {
      r.setGlobalAlpha(0.03 * (layers - i + 1));
      r.beginPath();
      r.arc(x, y, (radius * i) / layers, 0, Math.PI * 2);
      r.fill(color);
    }
    r.setGlobalAlpha(1);
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.void);

    this.drawBloom(r, this.width * 0.82, this.height * 0.12, 260, BRAND.b);
    this.drawBloom(r, this.width * 0.1, this.height * 0.9, 220, BRAND.a);

    for (let x = DOT_SPACING; x < this.width; x += DOT_SPACING) {
      for (let y = DOT_SPACING; y < this.height; y += DOT_SPACING) {
        r.beginPath();
        r.roundRect(x - 0.5, y - 0.5, 1, 1, 0);
        r.fill(COLOR.gridDot);
      }
    }

    const titleFont = FONT.display(44);
    const prefix = "Made with ";
    r.fillText(prefix, MASTHEAD_X, MASTHEAD_Y + 40, titleFont, COLOR.ink);
    const wordX = MASTHEAD_X + measureText(prefix, titleFont);
    const wordGrad = r.createLinearGradient(wordX, 0, wordX + 210, 0, [
      { stop: 0, color: BRAND.a },
      { stop: 1, color: BRAND.b },
    ]);
    r.fillText("VectoJS", wordX, MASTHEAD_Y + 40, titleFont, wordGrad);

    r.fillText(
      "Interactive pieces rendered entirely on one canvas — no DOM, no reflow.",
      MASTHEAD_X,
      MASTHEAD_Y + 68,
      FONT.body(14),
      COLOR.textMuted,
    );
  }
}
