import { Entity, type IRenderer } from "@vectojs/core";
import { measureText } from "@vectojs/ui";
import pkg from "../../package.json";
import { COLOR, FONT, BRAND_GRADIENT } from "./tokens";

const TITLE_SIZE = 46;
const BADGE_H = 24;
const BADGE_GAP = 8;
const BADGE_PAD_X = 12;

/**
 * The hero band at the top of the scrollable hub: gradient headline, tagline,
 * and a row of small status badges (engine versions + catalog counts). Version
 * strings come straight from package.json dependencies so they can never
 * drift from what the bundle actually ships.
 */
export class Masthead extends Entity {
  private readonly badges: string[];

  constructor(width: number, creationCount: number, appCount: number) {
    super("Masthead");
    this.width = width;
    this.height = 178;

    const deps = (pkg as { dependencies: Record<string, string> }).dependencies;
    this.badges = [
      `core ${deps["@vectojs/core"]}`,
      `ui ${deps["@vectojs/ui"]}`,
      `${creationCount} creations`,
      `${appCount} apps`,
    ];
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const titleFont = FONT.display(TITLE_SIZE);
    const baseline = 58;
    const prefix = "Made with ";
    r.fillText(prefix, 0, baseline, titleFont, COLOR.ink);
    const wordX = measureText(prefix, titleFont);
    const wordW = measureText("VectoJS", titleFont);
    const wordGrad = r.createLinearGradient(wordX, 0, wordX + wordW, 0, [
      { stop: 0, color: BRAND_GRADIENT.a },
      { stop: 1, color: BRAND_GRADIENT.b },
    ]);
    r.fillText("VectoJS", wordX, baseline, titleFont, wordGrad);

    r.fillText(
      "Interactive pieces and full applications rendered entirely on canvas — no DOM, no reflow.",
      0,
      baseline + 34,
      FONT.body(15),
      COLOR.textMuted,
    );

    const badgeFont = FONT.mono(11);
    let x = 0;
    const y = baseline + 58;
    for (const badge of this.badges) {
      const w = measureText(badge, badgeFont) + BADGE_PAD_X * 2;
      r.beginPath();
      r.roundRect(x, y, w, BADGE_H, BADGE_H / 2);
      r.fill(COLOR.groundRaised);
      r.stroke(COLOR.ruleBright, 1);
      r.fillText(badge, x + BADGE_PAD_X, y + 16, badgeFont, COLOR.textMuted);
      x += w + BADGE_GAP;
    }
  }
}
