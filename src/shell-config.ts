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
