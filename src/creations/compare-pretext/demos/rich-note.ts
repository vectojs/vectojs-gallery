/**
 * Rich Text / "Rich Note" — port of pretext's rich-note demo.
 *
 * pretext's version mixes plain text, monospace code spans, link-styled
 * text, and atomic "chip" pills inline, using a dedicated `rich-inline`
 * helper so a chip never breaks mid-pill while the surrounding text still
 * wraps freely — mixing three fonts inline and guaranteeing atomic pills
 * would otherwise mean either nested inline-block DOM tricks or per-frame
 * `getBoundingClientRect()` probing. Ported here on `@vectojs/ui`'s `Flow`
 * (a `Stack` configured `direction: 'horizontal', wrap: true`): each word of
 * plain/code/link text becomes its own atomic `Text` child, and every chip
 * becomes an atomic pill `Entity` — `Flow`'s wrap-at-child-boundary layout
 * already treats every added child as unbreakable, so a chip can never
 * split without any extra plumbing. This is the exact pattern
 * `MathMarkdown.renderMixedParagraph` already uses in this repo for
 * mixed text+block content.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { Card, Flow, Text } from "@vectojs/ui";
import { WARM, FONT } from "../shared/theme";
import { CONTENT_TOP, HEADER_TITLE_Y, drawDemoHeader } from "../shared/chrome";

type TextStyleName = "body" | "link" | "code";
type ChipTone = "mention" | "status" | "priority" | "time" | "count";
type Spec =
  | { kind: "text"; text: string; style: TextStyleName }
  | { kind: "chip"; label: string; tone: ChipTone };

// Same content as pretext's DEFAULT_RICH_NOTE_SPECS: an engineering-standup
// sentence deliberately mixing English, Chinese, Arabic, emoji, and five
// chip pills of varying tone/width.
const SPECS: Spec[] = [
  { kind: "text", text: "Ship ", style: "body" },
  { kind: "chip", label: "@maya", tone: "mention" },
  { kind: "text", text: "'s ", style: "body" },
  { kind: "text", text: "rich-note", style: "code" },
  { kind: "text", text: " card once ", style: "body" },
  { kind: "text", text: "pre-wrap", style: "code" },
  { kind: "text", text: " lands. Status ", style: "body" },
  { kind: "chip", label: "blocked", tone: "status" },
  { kind: "text", text: " by ", style: "body" },
  { kind: "text", text: "vertical text", style: "link" },
  {
    kind: "text",
    text: " research, but 北京 copy and Arabic QA are both green ✅. Keep ",
    style: "body",
  },
  { kind: "chip", label: "جاهز", tone: "status" },
  { kind: "text", text: " for ", style: "body" },
  { kind: "text", text: "Cmd+K", style: "code" },
  {
    kind: "text",
    text: " docs; the review bundle now includes 中文 labels, عربي fallback, and one more launch pass 🚀 for ",
    style: "body",
  },
  { kind: "chip", label: "Fri 2:30 PM", tone: "time" },
  { kind: "text", text: ". Keep ", style: "body" },
  { kind: "text", text: "layoutNextLine()", style: "code" },
  { kind: "text", text: " public, tag this ", style: "body" },
  { kind: "chip", label: "P1", tone: "priority" },
  { kind: "text", text: ", keep ", style: "body" },
  { kind: "chip", label: "3 reviewers", tone: "count" },
  { kind: "text", text: ", and route feedback to ", style: "body" },
  { kind: "text", text: "design sync", style: "link" },
  { kind: "text", text: ".", style: "body" },
];

const BODY_FONT = FONT.sans(17, 500);
const LINK_FONT = FONT.sans(17, 600);
const CODE_FONT = FONT.mono(14);
const CHIP_FONT = FONT.sans(12, 700);

const TEXT_STYLE: Record<TextStyleName, { font: string; color: string }> = {
  body: { font: BODY_FONT, color: WARM.ink },
  link: { font: LINK_FONT, color: WARM.accent },
  code: { font: CODE_FONT, color: "#8a4b1f" },
};

const CHIP_TONE: Record<ChipTone, { bg: string; fg: string }> = {
  mention: { bg: "#dbeafe", fg: "#1d4ed8" },
  status: { bg: "#fde8d8", fg: "#b45309" },
  priority: { bg: "#fee2e2", fg: "#b91c1c" },
  time: { bg: "#dcfce7", fg: "#15803d" },
  count: { bg: "#ede9fe", fg: "#6d28d9" },
};

const BODY_MIN_WIDTH = 260;
const BODY_DEFAULT_WIDTH = 516;
const BODY_MAX_WIDTH = 760;
const PAGE_MARGIN = 28;

class Pill extends Entity {
  private label: Text;
  private tone: ChipTone;

  constructor(label: string, tone: ChipTone) {
    super();
    this.tone = tone;
    this.label = new Text(label, {
      font: CHIP_FONT,
      color: CHIP_TONE[tone].fg,
    });
    this.add(this.label);
    // extraWidth 22 in pretext's model accounts for pill padding/border chrome
    // not part of the glyph advance — matched here as literal padding.
    this.width = this.label.width + 22;
    this.height = 24;
    this.label.setPosition(11, 6.5);
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, this.height / 2);
    r.fill(CHIP_TONE[this.tone].bg);
  }
}

const NOTE_TOP = CONTENT_TOP + 24;
const NOTE_PAD = 22;

class RichNoteDemo extends Entity {
  private W = 0;
  private H = 0;
  private noteCard: Card;
  private flow: Flow;
  private requestedWidth = BODY_DEFAULT_WIDTH;
  private bodyWidth = BODY_DEFAULT_WIDTH;
  private dragging = false;
  private sliderTrackX = 0;
  private sliderTrackW = 260;

  constructor() {
    super("RichNoteDemo");
    // The note shell is a real Card, and the flow is its child, so they are
    // positioned together (setting the card's position moves the flow with
    // it) — the previous split (card drawn in render(), flow positioned in
    // resizeTo()) desynced whenever the slider changed the width without a
    // resize.
    this.noteCard = new Card({
      width: BODY_DEFAULT_WIDTH + NOTE_PAD * 2,
      height: 200,
      bg: WARM.panel,
      border: WARM.rule,
      borderWidth: 1,
      radius: 20,
    });
    this.flow = new Flow({
      gap: 5,
      align: "center",
      maxWidth: BODY_DEFAULT_WIDTH,
    });
    this.flow.setPosition(NOTE_PAD, NOTE_PAD);
    this.buildFlowChildren();
    this.noteCard.add(this.flow);
    this.add(this.noteCard);

    this.interactive = true;
    this.on("pointerdown", (e: { localX?: number; localY?: number }) => {
      if (this.pointInSlider(e.localX, e.localY)) {
        this.dragging = true;
        this.updateFromPointer(e.localX);
      }
    });
    this.on("pointermove", (e: { localX?: number }) => {
      if (this.dragging) this.updateFromPointer(e.localX);
    });
    this.on("pointerup", () => {
      this.dragging = false;
    });
    this.on("pointerleave", () => {
      this.dragging = false;
    });
  }

  private buildFlowChildren(): void {
    for (const spec of SPECS) {
      if (spec.kind === "chip") {
        this.flow.add(new Pill(spec.label, spec.tone));
        continue;
      }
      const style = TEXT_STYLE[spec.style];
      // Split on whitespace so each word is its own atomic Flow child —
      // Flow only ever wraps at child boundaries, so a run of words needs
      // one child per word to wrap naturally between them (mirrors
      // MathMarkdown.renderMixedParagraph's word-splitting for mixed
      // text+block paragraphs).
      const words = spec.text.split(/(\s+)/).filter((w) => w.length > 0);
      for (const word of words) {
        this.flow.add(new Text(word, { font: style.font, color: style.color }));
      }
    }
  }

  private pointInSlider(x?: number, y?: number): boolean {
    if (x === undefined || y === undefined) return false;
    return (
      x >= this.sliderTrackX - 12 &&
      x <= this.sliderTrackX + this.sliderTrackW + 12 &&
      y >= HEADER_TITLE_Y - 16 &&
      y <= HEADER_TITLE_Y + 12
    );
  }

  private updateFromPointer(x?: number): void {
    if (x === undefined) return;
    const t = Math.max(
      0,
      Math.min(1, (x - this.sliderTrackX) / this.sliderTrackW),
    );
    const maxBodyWidth = this.maxBodyWidthFor(this.W);
    this.requestedWidth = BODY_MIN_WIDTH + t * (maxBodyWidth - BODY_MIN_WIDTH);
    this.applyWidth();
    this.scene?.markDirty();
  }

  private maxBodyWidthFor(viewportWidth: number): number {
    return Math.max(
      BODY_MIN_WIDTH,
      Math.min(BODY_MAX_WIDTH, viewportWidth - PAGE_MARGIN * 2 - NOTE_PAD * 2),
    );
  }

  /** Relayout the flow and resize/reposition the note card to match. */
  private applyWidth(): void {
    const maxBodyWidth = this.maxBodyWidthFor(this.W);
    this.bodyWidth = Math.max(
      BODY_MIN_WIDTH,
      Math.min(maxBodyWidth, this.requestedWidth),
    );
    this.flow.maxWidth = this.bodyWidth;
    this.flow.layout();
    this.noteCard.width = this.bodyWidth + NOTE_PAD * 2;
    this.noteCard.height = this.flow.height + NOTE_PAD * 2;
    const noteLeft = Math.max(PAGE_MARGIN, (this.W - this.noteCard.width) / 2);
    this.noteCard.setPosition(noteLeft, NOTE_TOP);
  }

  isPointInside(): boolean {
    return true; // owns the width slider directly, needs pointer events over its whole box
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.sliderTrackX = PAGE_MARGIN + 320;
    this.sliderTrackW = Math.min(
      260,
      Math.max(140, width - this.sliderTrackX - 40),
    );
    this.applyWidth();
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(WARM.page);
    drawDemoHeader(
      r,
      PAGE_MARGIN,
      "Rich Text",
      "Text runs, links, code spans, and atomic chips — adjust the width and the chips stay whole while text keeps wrapping.",
    );

    // Width slider (drawn in the header band, right of the title)
    const trackY = HEADER_TITLE_Y - 4;
    r.beginPath();
    r.roundRect(this.sliderTrackX, trackY - 2, this.sliderTrackW, 4, 2);
    r.fill(WARM.rule);
    const t =
      (this.bodyWidth - BODY_MIN_WIDTH) /
      (this.maxBodyWidthFor(this.W) - BODY_MIN_WIDTH || 1);
    const handleX = this.sliderTrackX + t * this.sliderTrackW;
    r.fillCircle(handleX, trackY, 8, WARM.accent);
    r.fillText(
      `Text width: ${Math.round(this.bodyWidth)}px`,
      this.sliderTrackX,
      trackY - 14,
      FONT.sans(12, 600),
      WARM.muted,
    );
  }
}

export default RichNoteDemo;
