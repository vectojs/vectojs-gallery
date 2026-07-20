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
import { VirtualList, Markdown, type MarkdownTheme } from "@vectojs/ui";
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

class MarkdownChatDemo extends Entity {
  private W = 0;
  private H = 0;
  private messages: ChatMessage[];
  private list: VirtualList<ChatMessage> | null = null;

  constructor() {
    super("MarkdownChatDemo");
    this.messages = buildMessages();
  }

  isPointInside(): boolean {
    return false;
  }

  private rebuildList(): void {
    if (this.list) {
      this.remove(this.list);
      this.list = null;
    }
    const listW = Math.min(760, this.W - 48);
    const left = Math.max(24, (this.W - listW) / 2);
    const rowWidth = listW;
    this.list = new VirtualList<ChatMessage>({
      items: this.messages,
      renderItem: (item) => new ChatBubble(item, rowWidth),
      estimatedRowHeight: 120,
      width: listW,
      height: this.H - CONTENT_TOP - 16,
      overscan: 4,
    });
    this.list.setPosition(left, CONTENT_TOP);
    this.add(this.list);
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.rebuildList();
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
