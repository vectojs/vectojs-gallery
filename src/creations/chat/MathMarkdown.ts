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

import { Markdown, Image, Stack, Flow } from "@vectojs/ui";
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
  tokens: Token[];
  updateTokens(tokens: Token[]): void;
}

let lexWorker: Worker | null = null;
let workerIdCounter = 0;
// `cb` receives (matchLen, tail): the caller's own tokens[0..matchLen) are
// still valid and only `tail` is new — see the matching comment in
// mathMarkdownWorker.ts for why the worker sends a diff instead of the full
// re-lexed tree on every call.
const workerCallbacks = new Map<
  number,
  (matchLen: number, tail: Token[]) => void
>();

if (typeof Worker !== "undefined") {
  try {
    lexWorker = new Worker(
      new URL("./mathMarkdownWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    lexWorker.onmessage = (e: MessageEvent<LexResponse>) => {
      const { id, matchLen, tail, error } = e.data;
      const cb = workerCallbacks.get(id);
      if (!cb) return;
      workerCallbacks.delete(id);
      if (error || !tail) {
        console.warn("MathMarkdown worker lex failed, falling back", error);
        return;
      }
      cb(matchLen ?? 0, tail);
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

  // Bumped on every `setContent` (a brand-new document); lets a lex
  // response that finally arrives after the document has since changed
  // identify itself as stale and no-op instead of splicing old tokens into
  // new content.
  private docEpoch = 0;
  private lexInFlight = false;
  private lexPending = false;

  public override setContent(markdown: string): this {
    this.docEpoch++;
    this.lexInFlight = false;
    this.lexPending = false;
    return super.setContent(markdown);
  }

  public override appendMarkdown(chunk: string): this {
    const self = this as unknown as MarkdownInternals;
    self.rawMarkdown += chunk;

    if (this.lexInFlight) {
      // `marked.lexer()` has no incremental API — every lex re-parses the
      // WHOLE accumulated text, so firing one request per streamed chunk
      // makes a document's total lex cost scale with the square of its
      // length. Coalesce: let the text keep growing, and pick up every bit
      // of it in ONE more request once the in-flight one resolves, instead
      // of queuing a full re-lex behind every single chunk. Without this, a
      // fast/long document can leave the worker with a backlog that keeps
      // growing chunk-over-chunk, and that backlog bleeds into whatever
      // document loads next (see forge/findings.md 2026-07-19 — reported as
      // "FPS drops lower and lower as more EPUBs are loaded").
      this.lexPending = true;
      return this;
    }

    this.dispatchLex();
    return this;
  }

  private dispatchLex(): void {
    const self = this as unknown as MarkdownInternals;
    const epoch = this.docEpoch;
    this.lexInFlight = true;
    this.lexPending = false;

    // Fixed for the lifetime of this exact request/response — the coalescing
    // above (`lexInFlight` gating further dispatches) is what keeps this
    // snapshot valid: nothing else can advance `self.tokens` while this is
    // pending, so reconstructing against it later is always correct.
    const oldTokensSnapshot = self.tokens;
    const oldRaws = oldTokensSnapshot.map((t) => t.raw);

    const apply = (matchLen: number, tail: Token[]) => {
      this.lexInFlight = false;
      if (epoch !== this.docEpoch) return; // a newer document has since loaded
      const tokens = [...oldTokensSnapshot.slice(0, matchLen), ...tail];
      self.updateTokens(tokens);
      this.reconcileLastMixedParagraph(tokens);
      if (this.lexPending) this.dispatchLex();
    };

    if (lexWorker) {
      const id = workerIdCounter++;
      workerCallbacks.set(id, apply);
      lexWorker.postMessage({
        id,
        text: self.rawMarkdown,
        oldRaws,
      } satisfies LexRequest);
    } else {
      // No Worker support (or it crashed) — same-thread fallback, still
      // correct, just loses the off-main-thread benefit.
      apply(0, marked.lexer(self.rawMarkdown));
    }
  }

  /**
   * `@vectojs/ui`'s own `updateTokens` (called above) has a fast path for
   * the common streaming case — "only the last token changed, still a
   * paragraph" — that patches the existing entity in place via
   * `setSpans()` if it has one, entirely bypassing `renderToken` (see
   * Markdown.ts's `updateTokens`, the `existingEntity && 'setSpans' in
   * existingEntity` branch). A plain-text paragraph starts as a base
   * `RichText` (which does have `setSpans`), so as long as it keeps
   * growing as a plain paragraph, every chunk takes that fast path — even
   * once the growing text completes an `inlineMath`/`image` run, since the
   * check only compares old/new token TYPE ("paragraph"), never whether
   * the paragraph's own inline composition now needs our `Flow`-based
   * rendering. That in-place patch calls the base class's own
   * `collectSpans`, which renders `inlineMath` as raw amber-tinted text —
   * so formulas stayed unrendered until the gallery's own post-stream
   * "calibration" `setContent` rebuild ran (see forge/findings.md
   * 2026-07-19: reported as "formulas only render once streaming reaches
   * 100%").
   *
   * Fix: after every `updateTokens`, check whether the last token is a
   * paragraph that now needs mixed rendering, and whether the live last
   * child is still the stale plain entity from before that point — if so,
   * swap it for one built through `this.renderToken` (our `Flow` dispatch).
   * This only needs to run once per paragraph: once the child is a `Flow`
   * (which has no `setSpans`), the base class's own fast-path guard fails
   * on later ticks and correctly falls through to remove-and-rebuild via
   * `renderToken` on its own, so streaming keeps flowing math/images live
   * without any further help from here.
   */
  private reconcileLastMixedParagraph(tokens: Token[]): void {
    const last = tokens[tokens.length - 1];
    if (!last || last.type !== "paragraph") return;
    const pToken = last as unknown as { tokens?: Token[] };
    const needsFlow = pToken.tokens?.some(
      (t) => t.type === "inlineMath" || t.type === "image",
    );
    if (!needsFlow) return;

    const children = this.content.children;
    const lastChild = children[children.length - 1];
    if (!lastChild || lastChild instanceof Flow) return;

    this.content.remove(lastChild);
    const rebuilt = this.renderToken(last);
    if (rebuilt) this.content.add(rebuilt);
    this.width = this.content.width;
    this.height = this.content.height;
    this.scene?.markDirty();
  }

  /**
   * Build (or reuse from cache) a MathJax-rendered Image for one formula, via
   * the library's own code-block-as-math trick (there is no public API to
   * invoke its MathJax pipeline directly). Shared by the `displayMath` block
   * case and the inline-math case below — both need identical
   * cache/bitmap/content-projection wiring, just at different call sites.
   *
   * Both the base class's own `code`-block-as-math render path and this
   * method's cache-reconstruction branch position the image at `(16, 8)`
   * inside a padded wrapper — margin meant for a full-width display
   * equation sitting alone in its own block. Pass `inline: true` for a
   * formula that will be added as a `Flow` child alongside surrounding
   * words: it strips that block padding and returns the bare image at
   * `(0, 0)`, so the visible glyph sits flush with the text instead of
   * shifted toward the bottom-right of a now-invisible padded box (see
   * forge/findings.md 2026-07-19, "inline formulas render bottom-right").
   */
  private buildMathImage(
    mathText: string,
    raw: string,
    opts: { inline?: boolean } = {},
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

    if (opts.inline) {
      img.x = 0;
      img.y = 0;
      wrapper = img;
    }

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
   * Build a content image (standard `![alt](src)` markdown, not a math
   * formula) with an `onLoad` that both resizes to the real aspect ratio
   * AND reflows every ancestor Stack — `@vectojs/ui`'s own image-in-
   * paragraph case does the resize but never the reflow, so any content
   * added while the image was still loading stays positioned for the
   * initial guessed height (`initialWidth * 0.6`) and visually overlaps the
   * image once it settles to its real size. See forge/findings.md
   * 2026-07-18 ("rendered image overlapping with text").
   *
   * A single `this.content.layout()` is not enough: `Stack.layout()` also
   * resizes the Stack itself to fit its children, and that resize only
   * happens when `.layout()` runs on that SPECIFIC stack. The image's
   * immediate containing stack (this paragraph's mixed-content Stack, or —
   * inside a list item — that item's own Stack) never gets told to recompute
   * its own now-taller height, so `this.content` positions the NEXT sibling
   * using its stale one. Walk every ancestor Stack from the image up to (and
   * including) `this.content`, re-running layout at each level.
   */
  private buildContentImage(imgToken: { href: string; text: string }): Image {
    const maxWidth = this.maxWidth;
    const initialWidth = Math.min(800, maxWidth);
    const initialHeight = Math.round(initialWidth * 0.6);
    const img = new Image(imgToken.href, {
      width: initialWidth,
      height: initialHeight,
      alt: imgToken.text,
      radius: 8,
      onLoad: () => {
        const rawImg = img as unknown as { bitmap?: HTMLImageElement };
        const bmp = rawImg.bitmap;
        if (bmp && bmp.naturalWidth && bmp.naturalHeight) {
          const aspect = bmp.naturalHeight / bmp.naturalWidth;
          img.width = Math.min(bmp.naturalWidth, maxWidth);
          img.height = Math.round(img.width * aspect);

          let node: Entity | null = img.parent;
          while (node) {
            const maybeStack = node as unknown as { layout?: () => void };
            if (typeof maybeStack.layout === "function") maybeStack.layout();
            if (node === (this.content as unknown as Entity)) break;
            node = node.parent;
          }
          // `renderMarkdown`/`updateTokens` only ever set these from
          // `this.content`'s size at (re)build time — they don't track
          // `this.content`'s size afterward, so the gallery's own
          // scroll-range math (`markdownMaxScroll`, keyed off this height)
          // stays clamped to the pre-resize height and can't scroll far
          // enough to reach content the image pushed down.
          this.width = this.content.width;
          this.height = this.content.height;
          this.scene?.markDirty();
        }
      },
    });
    return img;
  }

  /**
   * Split a paragraph's inline tokens on `inlineMath` and `image` runs,
   * rendering each as its own entity (a MathJax image via
   * {@link buildMathImage}, or a content image via {@link buildContentImage})
   * alongside the surrounding text, then laying everything out in a single
   * horizontally-wrapping `Flow` so a formula/image sits inline within its
   * sentence instead of starting a new line (see forge/findings.md
   * 2026-07-19 — an earlier version used a vertical Stack here, which put
   * every formula, and the text before/after it, on its own line).
   *
   * `@vectojs/ui`'s RichText/LayoutEngine has no span type for an embedded
   * non-text entity, so a single formula-in-a-sentence can't be one RichText
   * — the closest in-scope approximation is: split plain `text` tokens on
   * whitespace into one-word entities, and add every word/formula/image as
   * its own `Flow` child, so wrapping happens at word granularity instead of
   * one block per run. Other inline token types (strong/em/codespan/link)
   * are kept as a single atomic `Flow` child rather than split further —
   * they're typically short phrases, not the long runs that caused the
   * one-per-line bug.
   */
  private renderMixedParagraph(pToken: {
    tokens?: Token[];
    text: string;
  }): Entity {
    const flow = new Flow({ gap: 5, align: "center", maxWidth: this.maxWidth });

    const addAtomicToken = (t: { type: string; raw: string; text: string }) => {
      const el = super.renderToken({
        type: "paragraph",
        text: "",
        raw: "",
        tokens: [t],
      } as unknown as Token);
      if (el) flow.add(el);
    };

    for (const child of pToken.tokens ?? []) {
      if (child.type === "inlineMath") {
        const mathText = (child as unknown as { text: string }).text;
        const raw = (child as unknown as { raw: string }).raw;
        const built = this.buildMathImage(mathText, raw, { inline: true });
        if (built) flow.add(built.wrapper);
      } else if (child.type === "image") {
        const imgToken = child as unknown as { href: string; text: string };
        flow.add(this.buildContentImage(imgToken));
      } else if (child.type === "text") {
        const text = (child as unknown as { text: string }).text;
        for (const word of text.split(/\s+/)) {
          if (word.length > 0) {
            addAtomicToken({ type: "text", raw: word, text: word });
          }
        }
      } else {
        addAtomicToken(
          child as unknown as { type: string; raw: string; text: string },
        );
      }
    }
    return flow;
  }

  protected override renderToken(token: Token): Entity | null {
    if (token.type === "displayMath") {
      const mathText = (token as unknown as { text: string }).text;
      const built = this.buildMathImage(mathText, token.raw);
      return built?.wrapper ?? null;
    }

    if (token.type === "paragraph") {
      const pToken = token as unknown as { tokens?: Token[]; text: string };
      if (
        pToken.tokens?.some(
          (t) => t.type === "inlineMath" || t.type === "image",
        )
      ) {
        return this.renderMixedParagraph(pToken);
      }
    }

    if (token.type === "list") {
      const listToken = token as unknown as {
        items: {
          tokens?: {
            type: string;
            text: string;
            raw: string;
            tokens?: Token[];
          }[];
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
            // Through `this`, not `super` — so inline math/images nested in
            // a list item also get split via renderMixedParagraph.
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
            } else if (inner.type === "text" && inner.tokens?.length) {
              // marked wraps a simple (non-loose) list item's single line in
              // one "text" token whose OWN nested `.tokens` holds the real
              // inline runs (inlineMath, image, ...). Pushing the wrapper
              // itself hid those from the `.some(inlineMath|image)` check
              // in the "paragraph" case above — unwrap it so detection sees
              // the same flat shape a real paragraph's `.tokens` has. See
              // forge/findings.md 2026-07-18 (list-nested formulas not
              // rendering).
              currentInlineTokens.push(
                ...(inner.tokens as unknown as {
                  type: string;
                  raw: string;
                  text: string;
                }[]),
              );
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
