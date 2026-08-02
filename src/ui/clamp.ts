import type { Text } from '@vectojs/ui';

/**
 * Truncates `full` word-by-word (appending an ellipsis) until `text` fits in
 * `maxLines` wrapped lines. Line height is derived from the Text's own
 * single-line measurement so the cap tracks the configured font, not a
 * hard-coded pixel count. Construction-time only — each retry is a cold
 * re-measure, so never call this per frame.
 */
export function clampTextToLines(text: Text, full: string, maxLines: number): void {
  const probe = text.height; // current (possibly multi-line) height
  text.setText('A');
  const lineH = text.height;
  text.setText(full);
  if (probe <= lineH * maxLines + 1) return;

  const words = full.split(/\s+/);
  while (words.length > 1 && text.height > lineH * maxLines + 1) {
    words.pop();
    text.setText(`${words.join(' ')}…`);
  }
}

/**
 * The part of `Text` {@link clampTagsToWidth} needs: set a string, read back the
 * width it measured to. Declared structurally so a test can drive the fit logic
 * with a fake measurer instead of a real canvas.
 */
export interface MeasurableText {
  setText(text: string): unknown;
  readonly width: number;
}

/**
 * Fits a joined tag list into `maxWidth` by dropping trailing tags, appending
 * `+N` for however many were elided.
 *
 * Tags are dropped whole. Truncating mid-tag would leave a meaningless fragment
 * ("Typogr…"), and the count at least tells the reader something is missing.
 * Unlike {@link clampTextToLines} this measures width, not height: the tag row
 * is a single line inside a fixed-height pill, so it can never wrap its way out
 * of an overflow.
 *
 * Construction-time only — each retry is a cold re-measure.
 */
export function clampTagsToWidth(
  text: MeasurableText,
  tags: readonly string[],
  separator: string,
  maxWidth: number,
): void {
  text.setText(tags.join(separator));
  if (text.width <= maxWidth || tags.length <= 1) return;

  // Walk down one tag at a time and stop at the first arrangement that fits.
  // The `keep === 1` arrangement is the floor: a bare "+3" would name nothing.
  for (let keep = tags.length - 1; keep >= 1; keep--) {
    text.setText(`${tags.slice(0, keep).join(separator)} +${tags.length - keep}`);
    if (text.width <= maxWidth) return;
  }
}
