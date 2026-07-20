/**
 * Bubbles — port of pretext's bubbles demo.
 *
 * pretext's version binary-searches (over cached glyph widths) the
 * narrowest bubble width that still wraps to the same line count as at the
 * chat's max width — a "shrinkwrap" CSS `fit-content` can't do (it only
 * gives the widest wrapped line, never the narrowest width that preserves
 * line count). Ported here on `LayoutEngine.layoutPrepared()` directly via
 * the shared `findTightWrapMetrics` helper — same binary search, same
 * arithmetic, no DOM round-trips because VectoJS never had any to begin
 * with. Two side-by-side panels use the identical seven messages: the left
 * "CSS fit-content" column sizes each bubble to its widest wrapped line (the
 * naive approach), the right "Pretext shrinkwrap" column sizes to the tight
 * width — visibly less wasted padding on short trailing lines.
 */
import {
  Entity,
  LayoutEngine,
  type IRenderer,
  type PreparedText,
} from "@vectojs/core";
import { Slider, Text } from "@vectojs/ui";
import { WARM, FONT } from "../shared/theme";
import { fontMeasurer } from "../shared/measure";
import { layoutMetrics, findTightWrapMetrics } from "../shared/layoutMetrics";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";

// Same 7 messages as the pretext original (dev-culture chat, CJK+emoji,
// Arabic bidi, one long English line — the exact mixed-script stress set).
interface Msg {
  sent: boolean;
  text: string;
}
const MESSAGES: Msg[] = [
  { sent: false, text: "Yo did you see the new Pretext library?" },
  {
    sent: true,
    text: "yeah! It measures text without the DOM. Pure JavaScript arithmetic",
  },
  {
    sent: false,
    text: "That shrinkwrap demo is wild it finds the exact minimum width for multiline text. CSS can't do that.",
  },
  { sent: true, text: "성능 최적화가 정말 많이 되었더라고요 🎉" },
  { sent: false, text: "Oh wow it handles CJK and emoji too??" },
  {
    sent: true,
    text: "كل شيء! Mixed bidi, grapheme clusters, whatever you want. Try resizing",
  },
  {
    sent: true,
    text: "the best part: zero layout reflow. You could shrinkwrap 10,000 bubbles and the browser wouldn't even blink",
  },
];

const FONT_SIZE = 15;
const BUBBLE_FONT = FONT.sans(15);
const LINE_HEIGHT = 20;
const PAD_H = 12;
const PAD_V = 8;
const BUBBLE_MAX_RATIO = 0.8;
const SLIDER_MIN = 220;
const SLIDER_MAX = 760;
const PANEL_GAP = 24;
const PANEL_HEADER_H = 92;
const BUBBLE_GAP = 8;

const SENT_BG = "#0a84ff";
const RECV_BG = "#2c2c2e";
const CHAT_BG = "#1c1c1e";

interface BubbleGeom {
  cssWidth: number;
  tightWidth: number;
  height: number;
  lines: number;
}

class BubbleColumn extends Entity {
  private engine: LayoutEngine;
  private prepared: PreparedText[];
  private tight: boolean;
  private texts: Text[] = [];
  private geoms: BubbleGeom[] = [];
  private wastedPixels = 0;
  private chatWidth = 0;
  private title: string;

  constructor(tight: boolean, title: string) {
    super();
    this.tight = tight;
    this.title = title;
    this.engine = new LayoutEngine(1e9, 1e9, fontMeasurer(BUBBLE_FONT));
    this.prepared = MESSAGES.map((m) =>
      this.engine.prepare(m.text, {}, FONT_SIZE),
    );
    for (const m of MESSAGES) {
      const t = new Text(m.text, {
        font: BUBBLE_FONT,
        color: "#f5f5f7",
        lineHeight: LINE_HEIGHT,
      });
      this.add(t);
      this.texts.push(t);
    }
  }

  isPointInside(): boolean {
    return false;
  }

  layoutFor(chatWidth: number): void {
    this.chatWidth = chatWidth;
    const bubbleMaxWidth = Math.floor(chatWidth * BUBBLE_MAX_RATIO);
    const contentMaxWidth = bubbleMaxWidth - PAD_H * 2;
    this.wastedPixels = 0;
    this.geoms = [];

    for (let i = 0; i < MESSAGES.length; i++) {
      // Both columns compute BOTH widths: the CSS column needs the tight
      // width to measure how much dead space it wastes vs. the shrinkwrap.
      const cssMetrics = layoutMetrics(
        this.engine,
        this.prepared[i],
        contentMaxWidth,
        LINE_HEIGHT,
        FONT_SIZE,
      );
      const tightMetrics = findTightWrapMetrics(
        this.engine,
        this.prepared[i],
        contentMaxWidth,
        LINE_HEIGHT,
        FONT_SIZE,
      );

      const cssWidth = Math.ceil(cssMetrics.maxLineWidth) + PAD_H * 2;
      const tightWidth = Math.ceil(tightMetrics.maxLineWidth) + PAD_H * 2;
      const cssHeight = cssMetrics.height + PAD_V * 2;
      this.wastedPixels += Math.max(0, cssWidth - tightWidth) * cssHeight;

      const usedWidth = this.tight ? tightWidth : cssWidth;
      this.texts[i].setMaxWidth(usedWidth - PAD_H * 2);
      this.geoms.push({
        cssWidth,
        tightWidth,
        height: cssMetrics.height + PAD_V * 2,
        lines: cssMetrics.lineCount,
      });
    }

    this.reflow();
  }

  private reflow(): void {
    let y = PANEL_HEADER_H;
    const bubbleMaxWidth = Math.floor(this.chatWidth * BUBBLE_MAX_RATIO);
    for (let i = 0; i < MESSAGES.length; i++) {
      const g = this.geoms[i];
      const width = this.tight ? g.tightWidth : g.cssWidth;
      const x = MESSAGES[i].sent ? this.width - width - 16 : 16;
      this.texts[i].setPosition(x + PAD_H, y + PAD_V);
      y += g.height + BUBBLE_GAP;
    }
    void bubbleMaxWidth;
    this.height = y + 8;
  }

  wasted(): number {
    return this.tight ? 0 : this.wastedPixels;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 16);
    r.fill(CHAT_BG);
    r.fillText(this.title, 16, 30, FONT.sans(13, 700), "#8e8e93");
    r.fillText(
      `wasted: ${Math.round(this.wasted()).toLocaleString()} px²`,
      16,
      52,
      FONT.mono(12),
      this.tight ? "#34c759" : "#ff9f0a",
    );

    let y = PANEL_HEADER_H;
    for (let i = 0; i < MESSAGES.length; i++) {
      const g = this.geoms[i];
      const width = this.tight ? g.tightWidth : g.cssWidth;
      const x = MESSAGES[i].sent ? this.width - width - 16 : 16;
      r.save();
      r.translate(x, y);
      r.beginPath();
      r.roundRect(0, 0, width, g.height, 14);
      r.fill(MESSAGES[i].sent ? SENT_BG : RECV_BG);
      r.restore();
      y += g.height + BUBBLE_GAP;
    }
  }
}

class BubblesDemo extends Entity {
  private W = 0;
  private H = 0;
  private cssColumn: BubbleColumn;
  private tightColumn: BubbleColumn;
  private slider: Slider;
  private valueLabel = "";

  constructor() {
    super("BubblesDemo");
    this.cssColumn = new BubbleColumn(false, "CSS fit-content");
    this.tightColumn = new BubbleColumn(true, "Pretext shrinkwrap");
    this.add(this.cssColumn, this.tightColumn);

    this.slider = new Slider({
      min: SLIDER_MIN,
      max: SLIDER_MAX,
      value: 420,
      step: 1,
      width: 260,
      height: 20,
      trackColor: "rgba(0,0,0,0.08)",
      progressColor: WARM.accent,
      handleColor: "#ffffff",
      onChange: (v: number) => this.applyWidth(v),
    });
    this.add(this.slider);
    this.applyWidth(420);
  }

  private applyWidth(chatWidth: number): void {
    this.valueLabel = `${Math.round(chatWidth)}px`;
    this.cssColumn.layoutFor(chatWidth);
    this.tightColumn.layoutFor(chatWidth);
    this.scene?.markDirty();
  }

  isPointInside(): boolean {
    return false;
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;

    const contentWidth = Math.min(1080, width - 64);
    const left = Math.max(32, (width - contentWidth) / 2);
    const stacked = width < 780;
    const colWidth = stacked ? contentWidth : (contentWidth - PANEL_GAP) / 2;

    // Slider sits in the header zone (below the title); the "Container width"
    // label is drawn just left of it in render().
    this.slider.setPosition(left + 160, CONTENT_TOP - 18);

    const colsTop = CONTENT_TOP + 24;
    this.cssColumn.width = colWidth;
    this.tightColumn.width = colWidth;
    if (stacked) {
      this.cssColumn.setPosition(left, colsTop);
      this.tightColumn.setPosition(
        left,
        colsTop + this.cssColumn.height + PANEL_GAP,
      );
    } else {
      this.cssColumn.setPosition(left, colsTop);
      this.tightColumn.setPosition(left + colWidth + PANEL_GAP, colsTop);
    }

    const maxChatWidth = Math.max(
      SLIDER_MIN,
      Math.min(SLIDER_MAX, colWidth - 40),
    );
    this.slider.max = maxChatWidth;
    this.applyWidth(Math.min(this.slider.value, maxChatWidth));
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(WARM.page);
    const contentWidth = Math.min(1080, this.W - 64);
    const left = Math.max(32, (this.W - contentWidth) / 2);
    drawDemoHeader(
      r,
      left,
      "Shrinkwrap showdown",
      "fit-content sizes a bubble to its widest line; pretext finds the tightest width that still wraps to the same line count.",
    );
    r.fillText(
      `Container width: ${this.valueLabel}`,
      left + 160,
      CONTENT_TOP - 24,
      FONT.sans(13, 600),
      WARM.muted,
    );
  }
}

export default BubblesDemo;
