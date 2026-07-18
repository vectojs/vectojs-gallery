/**
 * Shared `marked` tokenizer extensions for display/inline math, used by both
 * the main thread (`MathMarkdown`) and the dedicated lexing worker
 * (`mathMarkdownWorker.ts`). Registering the exact same extensions in both
 * places is what lets the worker's `marked.lexer()` output be handed
 * straight to `MathMarkdown.updateTokens()` without a mismatch.
 */
import { marked } from "marked";

export function registerMathExtensions(): void {
  marked.use({
    extensions: [
      {
        name: "displayMath",
        level: "block",
        start(src: string) {
          return src.indexOf("$$");
        },
        tokenizer(src: string) {
          // match $$ ... $$ (display math blocks) even if indented
          const match = /^[ \t]*\$\$([\s\S]+?)\$\$/.exec(src);
          if (match) {
            return {
              type: "displayMath",
              raw: match[0],
              text: match[1].trim(),
            };
          }
          return undefined;
        },
        renderer(token: { raw: string }) {
          return token.raw;
        },
      },
      {
        name: "inlineMath",
        level: "inline",
        start(src: string) {
          return src.indexOf("$");
        },
        tokenizer(src: string) {
          // Match $formula$ or $$formula$$ (inline)
          const match = /^(\$\$?)([^$]+)\1/.exec(src);
          if (match) {
            return {
              type: "inlineMath",
              raw: match[0],
              text: match[2].trim(),
            };
          }
          return undefined;
        },
        renderer(token: { raw: string }) {
          return token.raw;
        },
      },
    ],
  });
}
