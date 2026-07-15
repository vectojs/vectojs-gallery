import { Entity, type IRenderer } from "@vectojs/core";
import { Markdown, Stack, Button, type MarkdownTheme } from "@vectojs/ui";
import { MessageView } from "./message-view";
import { renderSpecial } from "./render-special";
import { pacedTokens } from "./stream";
import { SAMPLES } from "./corpus";

const THEME: MarkdownTheme = {
  textColor: "#d7e0f0",
  headingColor: "#ffffff",
  codeColor: "#a5d6ff",
  codeBgColor: "rgba(124, 179, 255, 0.08)",
  quoteBorderColor: "#3b82f6",
  quoteTextColor: "#9fb0cc",
  hrColor: "rgba(255,255,255,0.12)",
  bodyFont: "Inter, system-ui, sans-serif",
  // A broad, concrete monospace stack. `ui-monospace` resolves inconsistently on
  // Linux, so we name widely-installed fixed-width fonts before the generic
  // fallback for more predictable glyph metrics across platforms.
  codeFont:
    'ui-monospace, "JetBrains Mono", "Fira Code", "Cascadia Code", "DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace',
  fontSize: 15,
};

class UserBubble extends Entity {
  private markdown: Markdown;
  private padding = 16;

  constructor(text: string, width: number, theme: MarkdownTheme) {
    super("UserBubble");
    this.markdown = new Markdown(text, {
      maxWidth: width - this.padding * 2,
      theme: {
        ...theme,
        textColor: "#e8eaed",
        headingColor: "#ffffff",
        codeColor: "#a5d6ff",
      },
    });
    this.add(this.markdown);
    this.layout();
  }

  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  layout(): void {
    this.markdown.content.layout();
    this.markdown.width = this.markdown.content.width;
    this.markdown.height = this.markdown.content.height;
    this.markdown.setPosition(this.padding, this.padding);
    this.width = this.markdown.width + this.padding * 2;
    this.height = this.markdown.height + this.padding * 2;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 18);
    r.fill("rgba(255, 255, 255, 0.08)");
    r.stroke("rgba(255, 255, 255, 0.12)", 1);
  }
}

const TPS = 24; // fixed — the playback-speed slider was dropped, matching pacedTokens' own default

/**
 * Streams SAMPLES[0]'s question/answer once on mount, and again on each
 * "Replay" click — the same minimal pattern already used by
 * vectojs-website/public/sandbox/text-streaming.html. No prompt input, no
 * multi-turn history, no live model: those all depended on real DOM this
 * port drops (see this plan's header).
 */
class Chat extends Entity {
  private transcript: Stack;
  private replayBtn: Button;
  private abort: AbortController | null = null;

  constructor() {
    super("Chat");

    this.transcript = new Stack({
      direction: "vertical",
      gap: 28,
      align: "start",
    });
    this.transcript.setPosition(28, 64);
    this.add(this.transcript);

    this.replayBtn = new Button("↻ Replay", {
      font: "600 13px Inter, system-ui",
      onClick: () => this.replay(),
    });
    this.add(this.replayBtn);

    this.replay();
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.replayBtn.setPosition(width - this.replayBtn.width - 16, 16);
    this.transcript.layout();
  }

  override destroy(): void {
    this.abort?.abort();
    super.destroy();
  }

  override isPointInside(): boolean {
    return false;
  }

  override update(): void {
    /* nothing per-frame — content only changes via replay()'s async token stream */
  }

  override render(_r: IRenderer): void {
    /* everything here is @vectojs/ui children (transcript, Replay button) — nothing to draw directly */
  }

  private contentWidth(): number {
    const colWidth = Math.min(800, this.width - 56);
    return Math.min(650, Math.max(260, colWidth * 0.85));
  }

  private replay(): void {
    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;

    while (this.transcript.children.length)
      this.transcript.remove(this.transcript.children[0]);

    const { q: question, a: answer } = SAMPLES[0];
    const width = this.contentWidth();

    const userBlock = new Stack({
      direction: "vertical",
      gap: 8,
      align: "end",
    });
    userBlock.add(new UserBubble(question, width, THEME));
    this.transcript.add(userBlock);

    const assistantBlock = new Stack({
      direction: "vertical",
      gap: 8,
      align: "start",
    });
    assistantBlock.add(
      new Markdown("**VectoJS**", {
        maxWidth: width,
        theme: { ...THEME, headingColor: "#86efac" },
      }),
    );
    const mv = new MessageView(width, THEME, renderSpecial, () =>
      this.transcript.layout(),
    );
    assistantBlock.add(mv.stack);
    this.transcript.add(assistantBlock);

    this.transcript.layout();

    void this.streamAnswer(answer, mv, signal);
  }

  private async streamAnswer(
    answer: string,
    mv: MessageView,
    signal: AbortSignal,
  ): Promise<void> {
    let raw = "";
    for await (const tok of pacedTokens(answer, TPS, signal)) {
      if (signal.aborted) break;
      raw += tok;
      mv.update(raw);
      this.transcript.layout();
    }
  }
}

export default Chat;
