/**
 * Dedicated lexing worker for MathMarkdown, off the main thread.
 *
 * The original playground version's `MathMarkdown.appendMarkdown` bypassed
 * @vectojs/ui's own Worker-offloaded lexing (its Worker's bundled `marked`
 * doesn't know the displayMath/inlineMath extensions) and instead called
 * `marked.lexer(this.rawMarkdown)` — the ENTIRE accumulated text, not just
 * the new chunk — synchronously on the main thread, on every animation
 * frame that had new streamed characters. As the document grows the cost
 * of every call grows with it, and it blocks the render thread while it
 * runs: this is the actual cause of "frame rate drops significantly when
 * entering Markdown" (see forge/findings.md, 2026-07-18). Re-lexing off
 * the main thread — mirroring the architecture the base library already
 * uses for its own supported syntax — removes the block entirely.
 */
import { marked, type Token } from "marked";
import { registerMathExtensions } from "./marked-extensions";

registerMathExtensions();

export interface LexRequest {
  id: number;
  text: string;
}
export interface LexResponse {
  id: number;
  tokens?: Token[];
  error?: string;
}

// `self` in a plain "DOM" lib context types as Window, not a Worker's
// DedicatedWorkerGlobalScope — cast once rather than pull in the
// "WebWorker" lib (which conflicts with "DOM" in the same tsconfig).
const worker = self as unknown as Worker;

worker.onmessage = (e: MessageEvent<LexRequest>) => {
  const { id, text } = e.data;
  try {
    const tokens = marked.lexer(text);
    worker.postMessage({ id, tokens } satisfies LexResponse);
  } catch (err) {
    worker.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies LexResponse);
  }
};
