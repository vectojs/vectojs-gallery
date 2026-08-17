import type { Entity } from '@vectojs/core';

/**
 * Search index over the *rendered* text of a Markdown document.
 *
 * The document is walked through the public projection API
 * (`Entity.getContentProjection`) rather than the raw markdown source, so a
 * query matches what the reader actually displays: `**bold**` is searched as
 * `bold`, a soft-wrapped phrase joins on a space, and formatting syntax never
 * matches. It knows nothing about `@vectojs/markdown`'s block classes — it
 * only needs the public `children` / `y` / `getContentProjection` surface, so
 * containers (Group/Stack) are descended and text leaves are consumed.
 */

/** One visual line of rendered text with its document-absolute geometry. */
export interface DocLine {
  /** Offset into {@link DocText.text} where this line's text begins. */
  start: number;
  /** Offset just past this line's text (its separator is not part of the range). */
  end: number;
  /** Document-absolute y of the line's origin. */
  y: number;
  /** Estimated line height in px, for the match highlight. */
  height: number;
}

/** The whole document as a flat searchable string plus per-line geometry. */
export interface DocText {
  /** Joined rendered text — the same logical text find-in-page searches. */
  text: string;
  /** Per-line [start, end) ranges in reading order, sorted by `start`. */
  lines: DocLine[];
}

/** A case-insensitive substring match in the document. */
export interface SearchMatch {
  /** Start offset into {@link DocText.text}. */
  index: number;
  /** Matched length in characters. */
  length: number;
  /** Document y of the line holding the match, to scroll to. */
  y: number;
  /** Line height for the highlight. */
  height: number;
}

const DEFAULT_LINE_HEIGHT = 20;

/**
 * Walk `root`'s subtree, summing each ancestor's local `y`, and collect every
 * projected text line. `root` is treated as the coordinate origin (its own `y`
 * is ignored) so the returned `y` values are document-local, ready for the
 * reader's `scrollMarkdownTo`.
 */
export function collectDocumentText(root: Entity): DocText {
  let text = '';
  const lines: DocLine[] = [];

  const appendLine = (lineText: string, y: number, height: number): void => {
    const start = text.length;
    text += lineText;
    lines.push({ start, end: text.length, y, height });
  };

  const walk = (entity: Entity, worldY: number): void => {
    let projection = null;
    try {
      projection = entity.getContentProjection?.() ?? null;
    } catch {
      projection = null;
    }

    if (projection && projection.text) {
      const contentY = projection.contentY ?? 0;
      // A new entity is a new block: put a hard break before its text so a
      // match cannot bridge two blocks whose logical source is separate.
      if (text.length > 0 && !text.endsWith('\n')) {
        text += '\n';
      }
      const visualLines = projection.lines;
      if (visualLines && visualLines.length > 0) {
        for (let i = 0; i < visualLines.length; i++) {
          const line = visualLines[i];
          const height = line.lineHeight ?? DEFAULT_LINE_HEIGHT;
          appendLine(line.text, worldY + contentY + (line.y ?? 0), height);
          // Between two visual lines the logical text carries a separator
          // (soft-wrap space, hard break, or none). It is not part of either
          // line's range, which is what keeps a match from bridging two lines
          // whose logical source does not actually join.
          if (i < visualLines.length - 1) {
            text += line.separatorAfter ?? '\n';
          }
        }
      } else {
        appendLine(projection.text, worldY + contentY, DEFAULT_LINE_HEIGHT);
      }
      return;
    }

    const children = entity.children;
    if (children) {
      for (const child of children) {
        walk(child, worldY + (child.y ?? 0));
      }
    }
  };

  walk(root, 0);
  return { text, lines };
}

/** The line whose range contains `offset`, or the last line starting at/before it. */
export function lineAt(doc: DocText, offset: number): DocLine | undefined {
  let lo = 0;
  let hi = doc.lines.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (doc.lines[mid].start <= offset) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 0 ? doc.lines[best] : undefined;
}

/**
 * Find every case-insensitive occurrence of `query` in the document, each
 * resolved to the line (and y) it starts on. Empty/whitespace query yields no
 * matches.
 */
export function findMatches(doc: DocText, query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const haystack = doc.text.toLowerCase();
  const matches: SearchMatch[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const line = lineAt(doc, idx);
    matches.push({
      index: idx,
      length: needle.length,
      y: line?.y ?? 0,
      height: line?.height ?? DEFAULT_LINE_HEIGHT,
    });
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return matches;
}
