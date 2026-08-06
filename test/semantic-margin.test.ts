import { describe, expect, test } from 'bun:test';
import { GALLERY_SCENE_OPTIONS } from '../src/shell-config';

/**
 * These pin the two halves of the resident-semantic-tier opt-in that
 * `vectojs-docs/TODO.md` asks the gallery for, and they are deliberately
 * structural rather than behavioural: whether an off-viewport transcript block is
 * really findable can only be answered in a browser, and is asserted in
 * `e2e/semantic-margin.e2e.ts` against `display` / `innerText` / `window.find`.
 *
 * A unit test still earns its place here because the failure mode this option
 * guards against is a *wiring* mistake — the pair only expresses a coarse tier
 * when the semantic margin is strictly wider than the projection margin, and
 * getting that backwards silently produces the old behaviour with no error.
 */
describe('gallery scene opts into a resident semantic tier', () => {
  test('projects every block semantically, however far off-viewport', () => {
    expect(GALLERY_SCENE_OPTIONS.contentSemanticMargin).toBe(Number.POSITIVE_INFINITY);
  });

  test('keeps per-line carriers windowed to a finite margin', () => {
    const margin = GALLERY_SCENE_OPTIONS.contentProjectionMargin;

    // The whole point of the split. `Infinity` here would restore the legacy
    // "materialize every line of the document" behaviour and make the semantic
    // margin meaningless — one scalar cannot express a coarse resident tier.
    expect(Number.isFinite(margin)).toBe(true);
    expect(margin).toBeGreaterThan(0);
  });

  test('leaves the materialization budget at the measured default', () => {
    // DEC-01KZ8DZE sized 256 from measurement; overriding it here would be
    // re-deciding that without evidence. `undefined` = take the engine default,
    // which is what "leave it alone" has to look like in an options object.
    expect(GALLERY_SCENE_OPTIONS.contentSemanticBudget).toBeUndefined();
  });

  test('still syncs the projection every frame', () => {
    // Unrelated to the semantic tier but load-bearing for selection fidelity:
    // a throttled sync makes a selection lag the scrolling canvas.
    expect(GALLERY_SCENE_OPTIONS.a11ySyncInterval).toBe(0);
  });
});
