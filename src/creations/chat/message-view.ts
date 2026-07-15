import { Entity } from "@vectojs/core";
import { Markdown, Stack, type MarkdownTheme } from "@vectojs/ui";
import { segmentMarkdown, type SpecialType } from "./segment";
import { renderInlineMath } from "./math-inline";

export type RenderSpecial = (
  type: SpecialType,
  code: string,
  maxWidth: number,
) => Promise<Entity | null>;

interface Slot {
  text: string; // last rendered source for this slot (markdown text, or special code+state)
  entity: Entity;
  md?: Markdown; // present for markdown slots so we can stream-append in place
}

const LABEL: Record<SpecialType, string> = {
  mermaid: "diagram",
  math: "equation",
  abc: "score",
};
const QUOTE_TEXT_PAD = "\u00a0\u00a0\u00a0";

function measureMonoCell(font: string): number {
  if (typeof document === "undefined") return 8;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 8;
  ctx.font = font;
  return Math.max(1, ctx.measureText("M").width);
}

function findCodeBreak(line: string, maxCols: number): number {
  const scanFrom = Math.min(maxCols, line.length - 1);
  for (let i = scanFrom; i > Math.max(8, maxCols * 0.55); i--) {
    if (/[\s,;:)\]}]/.test(line[i])) return i + 1;
  }
  return maxCols;
}

function wrapCodeLine(line: string, maxCols: number): string[] {
  if (line.length <= maxCols) return [line];

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const continuation = `${indent}  `;
  const out: string[] = [];
  let rest = line;

  while (rest.length > maxCols) {
    const at = findCodeBreak(rest, maxCols);
    out.push(rest.slice(0, at).trimEnd());
    rest = `${continuation}${rest.slice(at).trimStart()}`;
  }
  out.push(rest);
  return out;
}

function formatChatMarkdown(markdown: string, maxCodeCols: number): string {
  const out: string[] = [];
  let inFence = false;
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trimStart();
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      const markerChar = marker[0] as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
        fenceLen = marker.length;
      } else if (fenceChar === markerChar && marker.length >= fenceLen) {
        inFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(...wrapCodeLine(line, maxCodeCols));
      continue;
    }

    const quote = line.match(/^(\s*>+\s?)(.+)$/);
    if (quote && !quote[2].startsWith(QUOTE_TEXT_PAD)) {
      out.push(`${quote[1]}${QUOTE_TEXT_PAD}${quote[2]}`);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

/**
 * Renders one streaming assistant message. As raw Markdown accumulates it is
 * re-segmented (see {@link segmentMarkdown}); plain text flows through the
 * engine's incremental {@link Markdown.appendMarkdown} (append the delta, not
 * re-set the whole string — re-setting every token makes the layout grow without
 * bound), while mermaid / math / abc fences become SVG blocks via
 * {@link RenderSpecial} (a placeholder shows until the async render resolves).
 * The scene-graph children are only rebuilt when the segment set changes, so a
 * pure append just streams into the existing Markdown component.
 */
export class MessageView {
  readonly stack = new Stack({
    direction: "vertical",
    gap: 12,
    align: "start",
  });
  private slots: Slot[] = [];

  constructor(
    private maxWidth: number,
    private theme: MarkdownTheme,
    private renderSpecial?: RenderSpecial,
    private onChange?: () => void,
  ) {}

  private mkMarkdown(text: string): Markdown {
    return new Markdown(this.formatMarkdown(text), {
      maxWidth: this.maxWidth,
      theme: this.theme,
    });
  }

  private formatMarkdown(text: string): string {
    const codeFont = `15px ${this.theme.codeFont ?? "monospace"}`;
    const cellWidth = measureMonoCell(codeFont);
    const cols = Math.max(36, Math.floor((this.maxWidth - 44) / cellWidth));
    return formatChatMarkdown(text, cols);
  }

  update(raw: string): void {
    // Block $$…$$ is split out by segmentMarkdown (→ KaTeX SVG); inline $…$ inside
    // the remaining prose is converted to readable Unicode here, since it can't be
    // dropped as an SVG mid-paragraph.
    const segs = segmentMarkdown(raw).map((s) =>
      s.type === "markdown"
        ? { ...s, text: renderInlineMath(this.formatMarkdown(s.text)) }
        : s,
    );
    let structureChanged = segs.length !== this.slots.length;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const prev = this.slots[i];

      if (seg.type === "markdown") {
        if (prev?.md) {
          if (seg.text !== prev.text) {
            if (seg.text.startsWith(prev.text))
              prev.md.appendMarkdown(seg.text.slice(prev.text.length));
            else prev.md.setContent(seg.text);
            prev.text = seg.text;
          }
        } else {
          const md = this.mkMarkdown(seg.text);
          this.slots[i] = { text: seg.text, entity: md, md };
          structureChanged = true;
        }
        continue;
      }

      // special (mermaid / math / abc)
      const stateKey = `${seg.code}|${seg.closed}`;
      if (prev && !prev.md && prev.text === stateKey) continue; // unchanged special block
      const placeholder = this.mkMarkdown(`*rendering ${LABEL[seg.type]}…*`);
      const slot: Slot = { text: stateKey, entity: placeholder };
      this.slots[i] = slot;
      structureChanged = true;
      if (seg.closed && this.renderSpecial) {
        void this.renderSpecial(seg.type, seg.code, this.maxWidth).then(
          (ent) => {
            if (ent && this.slots[i] === slot) {
              slot.entity = ent;
              this.rebuild();
            }
          },
        );
      }
    }

    if (segs.length < this.slots.length) this.slots.length = segs.length;
    if (structureChanged) this.rebuild();
    else {
      this.stack.layout();
      this.onChange?.();
    }
  }

  private rebuild(): void {
    while (this.stack.children.length)
      this.stack.remove(this.stack.children[0]);
    for (const slot of this.slots) this.stack.add(slot.entity);
    this.stack.layout();
    this.onChange?.();
  }
}
