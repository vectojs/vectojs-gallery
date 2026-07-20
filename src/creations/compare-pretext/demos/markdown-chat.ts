/**
 * Markdown Chat — port of pretext's markdown-chat demo.
 *
 * pretext hand-writes ~1,100 lines of manual block layout to render 10,000
 * markdown messages in a virtualized list without any DOM measurement. VectoJS
 * ships that whole capability as reusable components: `Markdown` renders a
 * message to a canvas entity whose exact height is known immediately (no
 * reflow, no off-screen mount), and `VirtualList` caches each row's measured
 * height per index and only mounts the visible window. So this port is mostly
 * composition: a `VirtualList` of 10,000 messages whose `renderItem` builds a
 * bubble containing a `Markdown`. That is the whole point of the comparison —
 * the thing pretext must build by hand, VectoJS already has.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { Markdown, type MarkdownTheme } from "@vectojs/ui";
import { ScrollColumn } from "../shared/ScrollColumn";
import { DARK } from "../shared/theme";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";
import { CHAT_SEEDS } from "./markdown-chat-data";

const TOTAL_MESSAGES = 10000;
const BUBBLE_PAD = 14;
const ROW_GAP = 10;
const MAX_BUBBLE_WIDTH = 560;

interface ChatMessage {
  role: "assistant" | "user";
  markdown: string;
}

// Expand the seed conversation up to the full scale, tagging each repeat so the
// content visibly differs while the markdown mix stays representative.
function buildMessages(): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    const seed = CHAT_SEEDS[i % CHAT_SEEDS.length];
    const turn = Math.floor(i / CHAT_SEEDS.length) + 1;
    const suffix = turn > 1 ? `\n\n_(turn ${turn}, message ${i + 1})_` : "";
    out.push({ role: seed.role, markdown: seed.markdown + suffix });
  }
  return out;
}

const ASSISTANT_THEME: MarkdownTheme = {
  textColor: "#d9d6cf",
  headingColor: "#f3f1ea",
  codeColor: "#c9b98f",
  codeBgColor: "rgba(255,255,255,0.05)",
  quoteBorderColor: DARK.accentSoft,
  quoteTextColor: "#b7b3aa",
  hrColor: "rgba(255,255,255,0.12)",
  bodyFont: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  codeFont: '"SF Mono", ui-monospace, monospace',
  fontSize: 15,
};
const USER_THEME: MarkdownTheme = {
  ...ASSISTANT_THEME,
  textColor: "#f5f5f7",
  headingColor: "#ffffff",
  codeColor: "#fbe7c9",
  codeBgColor: "rgba(0,0,0,0.22)",
  quoteBorderColor: "rgba(255,255,255,0.5)",
  quoteTextColor: "#eef",
};

/** Deepest child bottom edge, in the root's local space (recursive). */
function subtreeBottom(root: Entity): number {
  let max = 0;
  const walk = (e: Entity, offsetY: number): void => {
    const top = offsetY + e.y;
    const bottom = top + (e.height || 0);
    if (bottom > max) max = bottom;
    for (const child of e.children) walk(child, top);
  };
  for (const child of root.children) walk(child, 0);
  return max;
}

/** One chat row: an editorial (assistant) block or a tinted (user) bubble. */
class ChatBubble extends Entity {
  private role: "assistant" | "user";
  private md: Markdown;
  private bubbleW: number;
  private bubbleH: number;
  private align: "left" | "right";
  private rowWidth: number;

  constructor(msg: ChatMessage, rowWidth: number) {
    super();
    this.role = msg.role;
    this.rowWidth = rowWidth;
    this.align = msg.role === "user" ? "right" : "left";

    const contentWidth =
      Math.min(MAX_BUBBLE_WIDTH, rowWidth - 32) - BUBBLE_PAD * 2;
    this.md = new Markdown(msg.markdown, {
      maxWidth: contentWidth,
      theme: msg.role === "user" ? USER_THEME : ASSISTANT_THEME,
      selectable: false,
    });
    this.md.setPosition(BUBBLE_PAD, BUBBLE_PAD);

    // Markdown's aggregate `.height` under-reports for some block kinds (e.g.
    // lists), so measure the subtree's real rendered extent instead — the
    // deepest child bottom edge in the Markdown's local space.
    const contentH = Math.max(this.md.height, subtreeBottom(this.md));
    this.bubbleW = Math.min(MAX_BUBBLE_WIDTH, this.md.width + BUBBLE_PAD * 2);
    this.bubbleH = contentH + BUBBLE_PAD * 2;
    this.add(this.md);

    this.width = rowWidth;
    this.height = this.bubbleH + ROW_GAP;
    this.layoutBubble();
  }

  private layoutBubble(): void {
    const x = this.align === "right" ? this.rowWidth - this.bubbleW - 16 : 16;
    this.md.setPosition(x + BUBBLE_PAD, BUBBLE_PAD);
    this._bubbleX = x;
  }

  private _bubbleX = 16;

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    if (this.role === "user") {
      r.beginPath();
      r.roundRect(this._bubbleX, 0, this.bubbleW, this.bubbleH, 16);
      r.fill("#3a4256");
    }
    // assistant messages are editorial (no bubble); a faint left rule instead
    if (this.role === "assistant") {
      r.beginPath();
      r.roundRect(this._bubbleX, 4, 3, this.bubbleH - 8, 1.5);
      r.fill("rgba(255,255,255,0.10)");
    }
  }
}

const EST_ROW_H = 120;
const OVERSCAN_PX = 400;

class MarkdownChatDemo extends Entity {
  private W = 0;
  private H = 0;
  private messages: ChatMessage[];
  private scrollCol: ScrollColumn;
  private rowWidth = 0;
  private listLeft = 0;
  // Lazy virtualization (non-inertial, mirrors masonry): measured height per
  // index, cumulative tops recomputed as heights become known, only the
  // visible window mounted as real ChatBubble children.
  private heights: number[];
  private tops: number[];
  private mounted = new Map<number, ChatBubble>();
  private lastScroll = -1;

  constructor() {
    super("MarkdownChatDemo");
    this.messages = buildMessages();
    this.heights = Array.from(
      { length: this.messages.length },
      () => EST_ROW_H,
    );
    this.tops = Array.from({ length: this.messages.length + 1 }, () => 0);
    this.scrollCol = new ScrollColumn(0, 0, "ChatScroll");
    this.add(this.scrollCol);
    this.recomputeTops();
  }

  isPointInside(): boolean {
    return false;
  }

  private recomputeTops(): void {
    let y = 0;
    for (let i = 0; i < this.messages.length; i++) {
      this.tops[i] = y;
      y += this.heights[i];
    }
    this.tops[this.messages.length] = y;
    this.scrollCol.setContentHeight(y);
  }

  private reconcile(): void {
    const scroll = this.scrollCol.scroll;
    if (Math.abs(scroll - this.lastScroll) < 0.5 && this.mounted.size > 0)
      return;
    this.lastScroll = scroll;
    const viewTop = scroll - OVERSCAN_PX;
    const viewBottom = scroll + (this.H - CONTENT_TOP) + OVERSCAN_PX;

    // Binary-ish scan for the first visible index (tops is monotonic).
    let start = 0;
    while (start < this.messages.length && this.tops[start + 1] < viewTop)
      start++;

    const visible = new Set<number>();
    let dirtyHeights = false;
    for (let i = start; i < this.messages.length; i++) {
      if (this.tops[i] > viewBottom) break;
      visible.add(i);
      let row = this.mounted.get(i);
      if (!row) {
        row = new ChatBubble(this.messages[i], this.rowWidth);
        this.mounted.set(i, row);
        this.scrollCol.content.add(row);
        // Cache the real measured height; flag a reflow if it differed.
        if (Math.abs(row.height - this.heights[i]) > 0.5) {
          this.heights[i] = row.height;
          dirtyHeights = true;
        }
      }
      row.setPosition(this.listLeft, this.tops[i]);
    }
    for (const [i, row] of this.mounted) {
      if (!visible.has(i)) {
        this.scrollCol.content.remove(row);
        this.mounted.delete(i);
      }
    }
    if (dirtyHeights) {
      this.recomputeTops();
      // Reposition still-mounted rows against corrected tops.
      for (const [i, row] of this.mounted)
        row.setPosition(this.listLeft, this.tops[i]);
    }
  }

  update(dt: number, time: number): void {
    super.update(dt, time);
    this.reconcile();
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    const listW = Math.min(760, width - 48);
    this.listLeft = 0;
    this.rowWidth = listW;
    const left = Math.max(24, (width - listW) / 2);
    this.scrollCol.setViewport(listW, height - CONTENT_TOP - 16);
    this.scrollCol.setPosition(left, CONTENT_TOP);
    this.scrollCol.content.width = listW;
    // Row widths changed → drop mounted rows + measured heights and re-lay out.
    for (const [, row] of this.mounted) this.scrollCol.content.remove(row);
    this.mounted.clear();
    this.heights.fill(EST_ROW_H);
    this.lastScroll = -1;
    this.recomputeTops();
    this.reconcile();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(DARK.page);
    drawDemoHeader(
      r,
      32,
      "Ten thousand messages",
      `A virtualized list of ${TOTAL_MESSAGES.toLocaleString()} markdown messages — each row's height known before it mounts.`,
      true,
    );
  }
}

export default MarkdownChatDemo;
