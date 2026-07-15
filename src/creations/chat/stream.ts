import { tokenize } from "./tokenize";

/**
 * Emit a string token-by-token at a target rate, so a prebaked answer plays back
 * like a live model streaming. The rate may be a live getter so the Speed slider
 * re-paces an in-flight reply mid-stream. Honors an AbortSignal so a new question
 * can interrupt the current playback.
 */
export async function* pacedTokens(
  text: string,
  tokensPerSec: number | (() => number),
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const rateOf =
    typeof tokensPerSec === "function" ? tokensPerSec : () => tokensPerSec;
  for (const tok of tokenize(text)) {
    if (signal?.aborted) return;
    yield tok;
    const delay = Math.max(0, 1000 / Math.max(1, rateOf()));
    if (delay > 0) await sleep(delay, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}
