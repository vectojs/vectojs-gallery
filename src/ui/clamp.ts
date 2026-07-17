import type { Text } from "@vectojs/ui";

/**
 * Truncates `full` word-by-word (appending an ellipsis) until `text` fits in
 * `maxLines` wrapped lines. Line height is derived from the Text's own
 * single-line measurement so the cap tracks the configured font, not a
 * hard-coded pixel count. Construction-time only — each retry is a cold
 * re-measure, so never call this per frame.
 */
export function clampTextToLines(
  text: Text,
  full: string,
  maxLines: number,
): void {
  const probe = text.height; // current (possibly multi-line) height
  text.setText("A");
  const lineH = text.height;
  text.setText(full);
  if (probe <= lineH * maxLines + 1) return;

  const words = full.split(/\s+/);
  while (words.length > 1 && text.height > lineH * maxLines + 1) {
    words.pop();
    text.setText(`${words.join(" ")}…`);
  }
}
