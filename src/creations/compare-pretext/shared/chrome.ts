/**
 * Shared chrome layout for compare-pretext sub-demos: a reserved top band
 * (for the gallery shell's "← Gallery" chip plus this creation's own "← All
 * demos" chip, which sit side by side) and a consistent eyebrow/title header
 * below it, so no demo's own content ever collides with the top navigation.
 * Every demo draws its header via {@link drawDemoHeader} and starts its
 * interactive content at or below {@link CONTENT_TOP}.
 */
import type { IRenderer } from "@vectojs/core";
import { WARM, DARK, FONT } from "./theme";

/** Height of the reserved top band that holds the back chips. */
export const CHIP_BAND_H = 56;
/** Baseline Y for a demo's small mono eyebrow line. */
export const HEADER_EYEBROW_Y = 66;
/** Baseline Y for a demo's serif title. */
export const HEADER_TITLE_Y = 92;
/** Baseline Y for the first line of a demo's intro subtitle. */
export const HEADER_SUBTITLE_Y = 114;
/** Y at/below which a demo may place its own interactive content. */
export const CONTENT_TOP = 158;

/** Local x/y of this creation's own back chip (sits right of the shell chip). */
export const BACK_CHIP_X = 150;
export const BACK_CHIP_Y = 14;

/**
 * Draws the pretext-matching header: a small mono "DEMO" eyebrow, the demo's
 * serif title, and an optional one-line intro subtitle beneath it — mirroring
 * the eyebrow/title/intro block every pretext demo page opens with.
 */
export function drawDemoHeader(
  r: IRenderer,
  left: number,
  title: string,
  subtitle?: string,
  dark = false,
): void {
  const t = dark ? DARK : WARM;
  r.fillText("DEMO", left, HEADER_EYEBROW_Y, FONT.mono(12), t.accent);
  r.fillText(title, left, HEADER_TITLE_Y, FONT.serifDisplay(26), t.ink);
  if (subtitle) {
    r.fillText(subtitle, left, HEADER_SUBTITLE_Y, FONT.sans(14), t.muted);
  }
}
