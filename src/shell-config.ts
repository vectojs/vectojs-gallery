/**
 * Shell-level Scene defaults that a creation may temporarily override and the
 * shell must be able to restore.
 *
 * A creation that mutates the shared `Scene` cannot restore the default by
 * writing a literal: `nexus` previously reset `maxFPS` to `60` on unmount with
 * a comment asserting that matched the shell, while the shell actually
 * constructs the Scene uncapped. The result was a permanent 60fps cap on every
 * creation opened after nexus for the rest of the page session. Keeping the
 * value in one place that both the constructor and the teardown path read
 * removes the chance for the two to disagree.
 */

/**
 * `0` = uncapped, i.e. the display's native refresh rate.
 *
 * Stream Reader's debug FPS panel is meant to reflect the user's actual screen
 * refresh rate, which an explicit cap (the engine default is 60) would hide
 * (forge/findings.md 2026-07-19).
 */
export const SHELL_MAX_FPS = 0;

/**
 * Per-line carrier window. Finite on purpose, and finite is the whole point:
 * `contentSemanticMargin: Infinity` below is only expressible as a *coarse
 * resident tier* because this one stays bounded. Setting both to `Infinity`
 * restores the legacy "materialize every line of the document" behaviour, which
 * is what the split exists to avoid.
 *
 * One viewport height is also the engine default, so this value changes nothing
 * on its own — it is written explicitly because the pairing is the contract, and
 * an implicit half of a contract is the half that gets broken by a later edit.
 */
const CARRIER_MARGIN_PX = 1200;

/**
 * Scene options for the gallery shell.
 *
 * Exported so `test/semantic-margin.test.ts` can assert the resident-tier wiring
 * without a DOM. The failure mode here is silent: the coarse tier exists only
 * while the semantic margin is strictly wider than the carrier margin, so getting
 * the pair backwards produces the old behaviour with no error anywhere.
 */
export const GALLERY_SCENE_OPTIONS = {
  maxFPS: SHELL_MAX_FPS,
  maxDPR: 2,
  a11ySyncInterval: 0,
  // Every block in the document keeps an element holding its full text, however
  // far off-viewport, so find-in-page and screen-reader read-ahead see the whole
  // transcript rather than the ~15 blocks near the viewport. Only the per-line
  // carriers are windowed, by CARRIER_MARGIN_PX above.
  //
  // `contentSemanticBudget` is deliberately absent: DEC-01KZ8DZE sized the
  // default of 256 from measurement, and it is what spreads the document-open
  // materialization of a wide semantic margin across frames instead of paying it
  // as one synchronous stall.
  contentSemanticMargin: Number.POSITIVE_INFINITY,
  contentProjectionMargin: CARRIER_MARGIN_PX,
} as const;
