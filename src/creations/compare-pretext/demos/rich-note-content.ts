/**
 * The Rich Text demo's content, and its translation into `StyledSpan[]`.
 *
 * The sentence deliberately mixes Latin, Chinese, Arabic and emoji, with five
 * atomic chips embedded mid-paragraph. It matches pretext's
 * `DEFAULT_RICH_NOTE_SPECS` so the two ports render the same content.
 *
 * The translation is the whole point of this module: the demo used to expand
 * this list into ~88 sibling entities inside a `Flow`, which replaced text
 * layout with box packing. Here it becomes ONE span list handed to one
 * `RichText`, so the engine does bidi, CJK line breaking and real space
 * advances itself.
 */

import { OBJECT_REPLACEMENT, type StyledSpan, type TextStyle } from '@vectojs/core';
import { chipAlt, chipObject, type ChipTone, type LabelMeasurer } from './rich-note-chips';
import { WARM } from '../shared/theme';

export type TextRole = 'body' | 'link' | 'code';

export type NoteSpec =
  | { kind: 'text'; text: string; style: TextRole }
  | { kind: 'chip'; label: string; tone: ChipTone };

/**
 * Per-role text styling.
 *
 * A note on weights: `TextStyle` carries only `bold`, not a numeric weight, and
 * `RichText` rebuilds each run's font from the family alone — the base font's
 * weight is discarded. So pretext's 500 body / 600 link / 600 code cannot be
 * reproduced exactly; body renders at 400 and the emphasized roles use `bold`.
 * Chips are unaffected, being rasterized offscreen with a full font string.
 */
export const ROLE_STYLE: Record<TextRole, TextStyle> = {
  body: { color: WARM.ink },
  link: { color: WARM.accent, bold: true },
  code: {
    color: '#8a4b1f',
    fontSize: 14,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
};

/** The standup sentence, verbatim from the reference model. */
export const SPECS: readonly NoteSpec[] = [
  { kind: 'text', text: 'Ship ', style: 'body' },
  { kind: 'chip', label: '@maya', tone: 'mention' },
  { kind: 'text', text: "'s ", style: 'body' },
  { kind: 'text', text: 'rich-note', style: 'code' },
  { kind: 'text', text: ' card once ', style: 'body' },
  { kind: 'text', text: 'pre-wrap', style: 'code' },
  { kind: 'text', text: ' lands. Status ', style: 'body' },
  { kind: 'chip', label: 'blocked', tone: 'status' },
  { kind: 'text', text: ' by ', style: 'body' },
  { kind: 'text', text: 'vertical text', style: 'link' },
  {
    kind: 'text',
    text: ' research, but 北京 copy and Arabic QA are both green ✅. Keep ',
    style: 'body',
  },
  { kind: 'chip', label: 'جاهز', tone: 'status' },
  { kind: 'text', text: ' for ', style: 'body' },
  { kind: 'text', text: 'Cmd+K', style: 'code' },
  {
    kind: 'text',
    text: ' docs; the review bundle now includes 中文 labels, عربي fallback, and one more launch pass 🚀 for ',
    style: 'body',
  },
  { kind: 'chip', label: 'Fri 2:30 PM', tone: 'time' },
  { kind: 'text', text: '. Keep ', style: 'body' },
  { kind: 'text', text: 'layoutNextLine()', style: 'code' },
  { kind: 'text', text: ' public, tag this ', style: 'body' },
  { kind: 'chip', label: 'P1', tone: 'priority' },
  { kind: 'text', text: ', keep ', style: 'body' },
  { kind: 'chip', label: '3 reviewers', tone: 'count' },
  { kind: 'text', text: ', and route feedback to ', style: 'body' },
  { kind: 'text', text: 'design sync', style: 'link' },
  { kind: 'text', text: '.', style: 'body' },
];

/**
 * Translate the spec list into spans for one `RichText`.
 *
 * Adjacent text specs are NOT merged: each keeps its own style, and the engine
 * batches same-style runs at paint time anyway.
 */
export function buildNoteSpans(
  specs: readonly NoteSpec[] = SPECS,
  measure?: LabelMeasurer,
): StyledSpan[] {
  const spans: StyledSpan[] = [];
  for (const spec of specs) {
    if (spec.kind === 'chip') {
      spans.push({
        text: OBJECT_REPLACEMENT,
        object: chipObject(spec.label, spec.tone, measure),
      });
    } else {
      spans.push({ text: spec.text, style: ROLE_STYLE[spec.style] });
    }
  }
  return spans;
}

/**
 * The plain-text equivalent of the note, as selection and AT should read it.
 * Chips contribute their `alt`, matching what `RichText` projects.
 */
export function noteAccessibleText(specs: readonly NoteSpec[] = SPECS): string {
  return specs
    .map((spec) => (spec.kind === 'chip' ? chipAlt(spec.label, spec.tone) : spec.text))
    .join('');
}
