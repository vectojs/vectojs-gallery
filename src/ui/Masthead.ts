import { Entity, type IRenderer } from '@vectojs/core';
import { measureText } from '@vectojs/ui';
import pkg from '../../package.json';
import { COLOR, FONT, BRAND_GRADIENT } from './tokens';

const TITLE_SIZE = 46;
/**
 * Floor for the shrink-to-fit headline. Below this the hero stops reading as a
 * hero, so an absurdly narrow viewport overflows rather than shrinking forever.
 *
 * 20 rather than a rounder 24 because the narrowest layout the shell still
 * offers a real hero is a 560px window: the rail takes 280 and the bed pads 32
 * a side, leaving 216px, and the headline measures 211px at 20 against 253px at
 * 24. Measured with the declared fallback face (Arial Black) — Archivo Black is
 * a webfont and may differ slightly, which is why this keeps a few px of margin.
 */
export const TITLE_SIZE_MIN = 20;
const TITLE_PREFIX = 'Made with ';
const TITLE_WORD = 'VectoJS';
const TITLE_FULL = TITLE_PREFIX + TITLE_WORD;
const TITLE_BASELINE = 58;
const TAGLINE_DY = 34;
const TAGLINE_LINE_H = 20;
const TAGLINE =
  'Interactive pieces and full applications rendered entirely on canvas — no DOM, no reflow.';
const BADGE_DY = 58;
const BADGE_H = 24;
const BADGE_GAP = 8;
const BADGE_PAD_X = 12;
/**
 * Space kept below the last badge row. Chosen so a single-row band still
 * measures the 178px this entity was fixed at before the row could wrap, which
 * keeps the hero's spacing against the sections below unchanged.
 */
const BOTTOM_PAD = 38;

/** A badge's resolved box, measured once at construction. */
export interface BadgeBox {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** Measures a string's rendered width. Injected so the packers stay testable. */
export type Measurer = (text: string, font: string) => number;

/**
 * The hero band at the top of the scrollable hub: gradient headline, tagline,
 * and a row of small status badges (engine versions + catalog counts). Version
 * strings come straight from package.json dependencies so they can never
 * drift from what the bundle actually ships.
 *
 * Layout is resolved at construction and when `resizeTo` receives a new width,
 * never in `render`. This keeps the entity persistent across shell relayouts
 * without repeating text measurement every frame.
 */
export class Masthead extends Entity {
  private titleSize = TITLE_SIZE;
  private taglineLines: readonly string[] = [];
  private badgeBoxes: readonly BadgeBox[] = [];
  private readonly labels: readonly string[];

  constructor(width: number, creationCount: number, appCount: number) {
    super('Masthead');
    this.width = width;

    const deps = (pkg as { dependencies: Record<string, string> }).dependencies;
    this.labels = [
      `core ${deps['@vectojs/core']}`,
      `ui ${deps['@vectojs/ui']}`,
      `${creationCount} creations`,
      `${appCount} apps`,
    ];

    this.resizeTo(width);
  }

  resizeTo(width: number): void {
    this.width = width;
    this.titleSize = fittedTitleSize(width);
    this.taglineLines = wrapTagline(TAGLINE, width);
    this.badgeBoxes = layOutBadges(this.labels, width, undefined, this.badgeTop());

    const lastRowY = this.badgeBoxes.length
      ? this.badgeBoxes[this.badgeBoxes.length - 1].y
      : this.badgeTop();
    this.height = lastRowY + BADGE_H + BOTTOM_PAD;
  }

  /** First badge row's y, pushed down by however many lines the tagline took. */
  private badgeTop(): number {
    const extraLines = Math.max(0, (this.taglineLines?.length ?? 1) - 1);
    return TITLE_BASELINE + BADGE_DY + extraLines * TAGLINE_LINE_H;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const titleFont = FONT.display(this.titleSize);
    r.fillText(TITLE_PREFIX, 0, TITLE_BASELINE, titleFont, COLOR.ink);
    const wordX = measureText(TITLE_PREFIX, titleFont);
    const wordW = measureText(TITLE_WORD, titleFont);
    const wordGrad = r.createLinearGradient(wordX, 0, wordX + wordW, 0, [
      { stop: 0, color: BRAND_GRADIENT.a },
      { stop: 1, color: BRAND_GRADIENT.b },
    ]);
    r.fillText(TITLE_WORD, wordX, TITLE_BASELINE, titleFont, wordGrad);

    const taglineFont = FONT.body(15);
    let taglineY = TITLE_BASELINE + TAGLINE_DY;
    for (const line of this.taglineLines) {
      r.fillText(line, 0, taglineY, taglineFont, COLOR.textMuted);
      taglineY += TAGLINE_LINE_H;
    }

    const badgeFont = FONT.mono(11);
    for (const badge of this.badgeBoxes) {
      r.beginPath();
      r.roundRect(badge.x, badge.y, badge.width, BADGE_H, BADGE_H / 2);
      r.fill(COLOR.groundRaised);
      r.stroke(COLOR.ruleBright, 1);
      r.fillText(badge.label, badge.x + BADGE_PAD_X, badge.y + 16, badgeFont, COLOR.textMuted);
    }
  }
}

/**
 * Largest title size at or below {@link TITLE_SIZE} whose full headline fits
 * `width`, floored at {@link TITLE_SIZE_MIN}.
 *
 * Canvas text does not reflow, and the enclosing `ScrollView` clips
 * (`clipChildren`), so a headline wider than its box is cut mid-glyph rather
 * than wrapped. Measuring at the target size and stepping down is the canvas
 * equivalent of a container query.
 */
export function fittedTitleSize(width: number, measure: Measurer = measureText): number {
  for (let size = TITLE_SIZE; size > TITLE_SIZE_MIN; size -= 1) {
    if (measure(TITLE_FULL, FONT.display(size)) <= width) return size;
  }
  return TITLE_SIZE_MIN;
}

/**
 * Greedily wraps the tagline to `width`.
 *
 * `IRenderer.fillText` draws one unwrapped line, so a fixed prose string in a
 * clipping container is cut mid-word — this is the same defect class as the
 * headline but needs a different remedy: prose reads better wrapped than shrunk,
 * where a headline reads better shrunk than wrapped.
 *
 * A single word wider than `width` still overflows rather than being broken
 * mid-word, which is the correct trade for a tagline of ordinary English.
 */
export function wrapTagline(
  text: string,
  width: number,
  measure: Measurer = measureText,
): string[] {
  const font = FONT.body(15);
  if (width <= 0 || measure(text, font) <= width) return [text];

  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, font) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Packs the badges into rows no wider than `width`.
 *
 * Each badge is self-sized from its own text, so this only needs a running width
 * check to decide where to break. A row always takes at least one badge, so a
 * badge wider than the whole band overflows rather than looping forever.
 */
export function layOutBadges(
  labels: readonly string[],
  width: number,
  measure: Measurer = measureText,
  top: number = TITLE_BASELINE + BADGE_DY,
): BadgeBox[] {
  const font = FONT.mono(11);
  const boxes: BadgeBox[] = [];
  let x = 0;
  let y = top;

  for (const label of labels) {
    const boxWidth = measure(label, font) + BADGE_PAD_X * 2;
    if (x > 0 && x + boxWidth > width) {
      x = 0;
      y += BADGE_H + BADGE_GAP;
    }
    boxes.push({ label, x, y, width: boxWidth });
    x += boxWidth + BADGE_GAP;
  }
  return boxes;
}
