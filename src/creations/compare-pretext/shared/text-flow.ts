/**
 * Canvas-measured text flow for the obstacle-routing demos. Stands in for
 * pretext's `prepareWithSegments` + `layoutNextLine`: measure every word/space
 * segment once, then greedily step one line at a time at an arbitrary width
 * (which the caller varies per line to route around obstacles). Pure once
 * prepared — no DOM reads during layout, the whole point of the comparison.
 */

export interface PreparedFlow {
  segments: string[];
  widths: number[];
  spaceWidth: number;
}

export interface FlowLine {
  text: string;
  width: number;
  /** Segment index to resume from for the next line. */
  endSeg: number;
}

function isSpace(t: string): boolean {
  return t.trim().length === 0;
}

/** Build a per-font canvas measurer (cached per string). */
export function makeFlowMeasurer(font: string): (t: string) => number {
  const ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (ctx) ctx.font = font;
  const cache = new Map<string, number>();
  return (t: string): number => {
    let w = cache.get(t);
    if (w === undefined) {
      w = ctx ? ctx.measureText(t).width : t.length * 8;
      cache.set(t, w);
    }
    return w;
  };
}

/** Segment a paragraph into alternating word/space segments with measured widths. */
export function prepareFlow(
  text: string,
  measure: (t: string) => number,
): PreparedFlow {
  const segments: string[] = [];
  const widths: number[] = [];
  for (const token of text.split(/(\s+)/)) {
    if (token.length === 0) continue;
    if (isSpace(token)) {
      segments.push(" ");
      widths.push(measure(" "));
    } else {
      segments.push(token);
      widths.push(measure(token));
    }
  }
  return { segments, widths, spaceWidth: measure(" ") };
}

/**
 * Greedily fill one line starting at `startSeg`, at most `maxWidth` wide.
 * Returns the line text (trailing space trimmed), its natural width, and the
 * segment index to resume from. Returns `null` when the text is exhausted.
 */
export function layoutNextFlowLine(
  prepared: PreparedFlow,
  startSeg: number,
  maxWidth: number,
): FlowLine | null {
  const { segments, widths } = prepared;
  const n = segments.length;
  let i = startSeg;
  while (i < n && isSpace(segments[i])) i++; // skip leading spaces
  if (i >= n) return null;

  let used = 0;
  let end = i;
  let text = "";
  let width = 0;
  while (i < n) {
    const seg = segments[i];
    const w = widths[i];
    if (!isSpace(seg) && used + w > maxWidth && used > 0) break;
    used += w;
    text += seg;
    i++;
    if (!isSpace(seg)) {
      end = i;
      width = used;
    }
  }
  // Trim trailing spaces from the emitted text.
  const trimmed = text.replace(/\s+$/, "");
  return { text: trimmed, width, endSeg: end };
}
