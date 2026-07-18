/**
 * MathMarkdown — extends @vectojs/ui Markdown to handle mathematical formulas
 * with streaming performance and text selection.
 *
 * 1. `appendMarkdown` re-lexes off the main thread via a dedicated Worker
 *    (see mathMarkdownWorker.ts) — @vectojs/ui's own internal Worker doesn't
 *    know the displayMath/inlineMath extensions registered below, so it
 *    can't be reused directly; this ships an equivalent Worker instead of
 *    falling back to a synchronous main-thread `marked.lexer()` call on
 *    every streamed frame (the actual cause of the reported frame-rate
 *    drop — see forge/findings.md, 2026-07-18).
 * 2. Parses `$$...$$` blocks as `displayMath` and `$...$` as `inlineMath`.
 * 3. Both delegate to the library's MathJax SVG generator (via a fake code
 *    block) — the base library's own `inlineMath` extension only tints the
 *    raw `$...$` source amber and never actually renders it, so `inlineMath`
 *    tokens are pulled out of their paragraph and rendered as their own small
 *    MathJax image (see `renderMixedParagraph`), same as `displayMath`.
 * 4. Every generated SVG Image is monkey-patched to project its raw LaTeX
 *    text to the A11y DOM (`getContentProjection`), enabling native text
 *    selection and preventing accidental clicks into SVG source.
 */

import { Markdown, Image, Stack } from "@vectojs/ui";
import { marked, type Token } from "marked";
import { Entity } from "@vectojs/core";
import { registerMathExtensions } from "./marked-extensions";
import type { LexRequest, LexResponse } from "./mathMarkdownWorker";

registerMathExtensions(); // main thread: only exercised by the sync fallback below

interface CachedFormula {
  href: string;
  width: number;
  height: number;
  bitmap: HTMLImageElement;
}
const mathjaxBase64Cache = new Map<string, CachedFormula>();

class MathWrapper extends Entity {
  isPointInside(): boolean {
    return false;
  }
  render() {}
}

// Access to Markdown's own private fields, mirroring the technique the base
// library uses internally — there is no public API for "append + reparse".
interface MarkdownInternals {
  rawMarkdown: string;
  updateTokens(tokens: Token[]): void;
}

let lexWorker: Worker | null = null;
let workerIdCounter = 0;
const workerCallbacks = new Map<number, (tokens: Token[]) => void>();

if (typeof Worker !== "undefined") {
  try {
    lexWorker = new Worker(
      new URL("./mathMarkdownWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    lexWorker.onmessage = (e: MessageEvent<LexResponse>) => {
      const { id, tokens, error } = e.data;
      const cb = workerCallbacks.get(id);
      if (!cb) return;
      workerCallbacks.delete(id);
      if (error || !tokens) {
        console.warn("MathMarkdown worker lex failed, falling back", error);
        return;
      }
      cb(tokens);
    };
    lexWorker.onerror = (err) => {
      console.warn("MathMarkdown worker crashed; using sync fallback", err);
      lexWorker = null;
    };
  } catch (err) {
    console.warn("Failed to start MathMarkdown worker", err);
  }
}

// ── MathMarkdown ──────────────────────────────────────────────────────────────

export class MathMarkdown extends Markdown {
  // The gallery toggles `interactive` on this whole entity to gate hit-testing
  // while hidden (see index.ts's setMarkdownShown). Without this override, the
  // a11y shadow div that creates sits above (and eats pointer events meant
  // for) the selectable text/link hotspots underneath, breaking native
  // text-selection drag across the entire panel — see forge/findings.md
  // 2026-07-18 (structural-interactive container blocking native selection).
  override getA11yAttributes() {
    return { pointerEvents: "none" as const };
  }

  public override appendMarkdown(chunk: string): this {
    const self = this as unknown as MarkdownInternals;
    self.rawMarkdown += chunk;

    if (lexWorker) {
      const id = workerIdCounter++;
      workerCallbacks.set(id, (tokens) => self.updateTokens(tokens));
      lexWorker.postMessage({
        id,
        text: self.rawMarkdown,
      } satisfies LexRequest);
    } else {
      // No Worker support (or it crashed) — same-thread fallback, still
      // correct, just loses the off-main-thread benefit.
      self.updateTokens(marked.lexer(self.rawMarkdown));
    }
    return this;
  }

  /**
   * Build (or reuse from cache) a MathJax-rendered Image for one formula, via
   * the library's own code-block-as-math trick (there is no public API to
   * invoke its MathJax pipeline directly). Shared by the `displayMath` block
   * case and the inline-math case below — both need identical
   * cache/bitmap/content-projection wiring, just at different call sites.
   */
  private buildMathImage(
    mathText: string,
    raw: string,
  ): { wrapper: Entity; img: Image } | null {
    let cached = mathjaxBase64Cache.get(mathText);
    let img: Image | null = null;
    let wrapper: Entity | null = null;

    if (!cached) {
      // Trick the library into generating a MathJax SVG by pretending it's a code block
      const fakeToken = {
        type: "code",
        lang: "math",
        text: mathText,
        raw,
      };
      wrapper = super.renderToken(fakeToken as unknown as Token);
      const children = (wrapper as unknown as { children?: Entity[] })
        ?.children;
      if (wrapper && children && children.length > 0) {
        img = children[0] as Image;
        const rawImg = img as unknown as {
          src: string;
          bitmap?: HTMLImageElement;
        };
        cached = {
          href: rawImg.src,
          width: img.width,
          height: img.height,
          bitmap: rawImg.bitmap as HTMLImageElement,
        };
        mathjaxBase64Cache.set(mathText, cached);
      }
    } else {
      // Construct from cache to completely avoid the MathJax render cost per formula.
      wrapper = new MathWrapper();
      img = new Image(cached.href, {
        width: cached.width,
        height: cached.height,
        alt: raw,
      });
      const rawImg = img as unknown as {
        bitmap?: HTMLImageElement;
        loaded?: boolean;
      };
      if (cached.bitmap) {
        rawImg.bitmap = cached.bitmap;
        if (cached.bitmap.complete) {
          rawImg.loaded = true;
        } else {
          cached.bitmap.addEventListener("load", () => {
            rawImg.loaded = true;
            img?.scene?.markDirty();
          });
        }
      }
      img.x = 16;
      img.y = 8;
      wrapper.add(img);
      wrapper.width = img.width + 16;
      wrapper.height = img.height + 16;
    }

    if (!img || !wrapper) return null;

    // Disable default image click and <img alt> projection
    img.interactive = false;

    const rawLines = raw.split(/\r\n|\r|\n/);
    img.getContentProjection = () => ({
      text: raw,
      selectable: true,
      contentX: 0,
      contentY: 0,
      lines: rawLines.map((lineText: string, i: number) => ({
        text: lineText,
        x: 0,
        y: i * 20,
        baseline: i * 20 + 15,
        font: "16px monospace",
        lineHeight: 20,
      })),
      ligatures: "none",
    });

    return { wrapper, img };
  }

  /**
   * Split a paragraph's inline tokens on `inlineMath` runs, rendering each as
   * its own small MathJax image (via {@link buildMathImage}) inside a
   * vertical Stack alongside the surrounding text. `@vectojs/ui`'s own
   * `inlineMath` extension (registered inside its Markdown.ts) only ever
   * renders the raw `$...$` source tinted amber — it never reaches MathJax —
   * so without this override formulas silently fail to render (the "many
   * mathematical formulas failed to render" report). This mirrors the same
   * pattern the base library already uses to splice `image` tokens into a
   * paragraph (RichText spans can't embed images inline, only flow text), so
   * each formula lands on its own line rather than truly inline — a known,
   * shared limitation, not something introduced here.
   */
  private renderMixedParagraph(pToken: {
    tokens?: Token[];
    text: string;
  }): Entity {
    const stack = new Stack({ direction: "vertical", gap: 4 });
    let currentTokens: Token[] = [];

    const flushText = () => {
      if (currentTokens.length > 0) {
        const el = super.renderToken({
          type: "paragraph",
          text: "",
          raw: "",
          tokens: currentTokens,
        } as unknown as Token);
        if (el) stack.add(el);
        currentTokens = [];
      }
    };

    for (const child of pToken.tokens ?? []) {
      if (child.type === "inlineMath") {
        flushText();
        const mathText = (child as unknown as { text: string }).text;
        const raw = (child as unknown as { raw: string }).raw;
        const built = this.buildMathImage(mathText, raw);
        if (built) stack.add(built.wrapper);
      } else {
        currentTokens.push(child);
      }
    }
    flushText();
    return stack;
  }

  protected override renderToken(token: Token): Entity | null {
    if (token.type === "displayMath") {
      const mathText = (token as unknown as { text: string }).text;
      const built = this.buildMathImage(mathText, token.raw);
      return built?.wrapper ?? null;
    }

    if (token.type === "paragraph") {
      const pToken = token as unknown as { tokens?: Token[]; text: string };
      if (pToken.tokens?.some((t) => t.type === "inlineMath")) {
        return this.renderMixedParagraph(pToken);
      }
    }

    if (token.type === "list") {
      const listToken = token as unknown as {
        items: {
          tokens?: { type: string; text: string; raw: string }[];
          text: string;
        }[];
        ordered: boolean;
        start?: number;
      };
      // Reuse the same Stack constructor `this.content` already uses — the
      // base "list" case can't nest block-level tokens (math/code/blockquote)
      // inside a list item, only flat inline spans, so this composes each
      // item as its own vertical Stack instead.
      const listStack = new Stack({ direction: "vertical", gap: 6 });

      for (let i = 0; i < listToken.items.length; i++) {
        const item = listToken.items[i];
        const bullet = listToken.ordered
          ? `${Number(listToken.start ?? 1) + i}. `
          : "• ";

        const itemStack = new Stack({ direction: "vertical", gap: 4 });

        let currentInlineTokens: { type: string; raw: string; text: string }[] =
          [{ type: "text", raw: bullet, text: bullet }];

        const flushText = () => {
          if (
            currentInlineTokens.length > 1 ||
            (currentInlineTokens.length === 1 &&
              currentInlineTokens[0].text !== bullet)
          ) {
            const pToken = {
              type: "paragraph",
              text: "",
              raw: "",
              tokens: currentInlineTokens,
            };
            // Through `this`, not `super` — so inline math nested in a list
            // item also gets split into a MathJax image via renderMixedParagraph.
            const pEl = this.renderToken(pToken as unknown as Token);
            if (pEl) {
              pEl.x = 12;
              itemStack.add(pEl);
            }
            currentInlineTokens = [];
          }
        };

        if (item.tokens && item.tokens.length > 0) {
          for (const inner of item.tokens) {
            if (
              inner.type === "displayMath" ||
              inner.type === "code" ||
              inner.type === "blockquote" ||
              inner.type === "list"
            ) {
              flushText();
              const blockEl = this.renderToken(inner as unknown as Token);
              if (blockEl) {
                blockEl.x = 12; // Indent block elements inside the list item
                itemStack.add(blockEl);
              }
            } else {
              currentInlineTokens.push(inner);
            }
          }
          flushText();
        } else {
          currentInlineTokens.push({
            type: "text",
            raw: item.text,
            text: item.text,
          });
          flushText();
        }

        // Add to listStack AFTER itemStack is fully populated so its layout/height is correct!
        listStack.add(itemStack);
      }
      return listStack;
    }

    return super.renderToken(token);
  }
}
