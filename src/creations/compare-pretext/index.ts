/**
 * compare-pretext — a gallery-within-a-gallery-entry: VectoJS
 * reimplementations of the public demos at https://chenglou.me/pretext/demos,
 * a library for measuring/laying out multiline text without touching the
 * DOM. VectoJS is canvas-native — there's no DOM to reflow in the first
 * place, and its own `LayoutEngine.prepare()`/`layoutPrepared()` cold/hot
 * split already exceeds pretext's two-phase API (paragraph-level memoization,
 * Intl.Segmenter i18n, bidi, exclusion-rect flow) — so every demo here is
 * ported to run on that engine directly, matching the pretext original's
 * visuals and interactions.
 *
 * Root Entity owns a launcher grid (real `Card` tiles, mirroring pretext's
 * own /demos index page) built as ordinary child Entities — hit-testing,
 * transforms, and click routing all go through the normal VectoJS Scene
 * tree, the same as every other `@vectojs/ui` composition in this repo.
 * Clicking a tile lazily loads and mounts that sub-demo's own root Entity as
 * this entity's only child; a small back chip un-mounts it and rebuilds the
 * grid.
 */
import { Entity, Group } from "@vectojs/core";
import type { IRenderer } from "@vectojs/core";
import { Card, Text } from "@vectojs/ui";
import { WARM, FONT, DEMO_CARDS } from "./shared/theme";
import { BACK_CHIP_X, BACK_CHIP_Y } from "./shared/chrome";

const GRID_MAX_WIDTH = 940;
const GRID_TOP = 148;
const CARD_GAP = 16;
const CARD_PAD = 20;
const CARD_RADIUS = 20;
const CARD_H = 116;

interface ResizableChild {
  resizeTo(width: number, height: number): void;
}
function hasResizeTo(e: Entity): e is Entity & ResizableChild {
  return typeof (e as Partial<ResizableChild>).resizeTo === "function";
}

const LOADERS: Record<string, () => Promise<{ default: new () => Entity }>> = {
  accordion: () => import("./demos/accordion"),
  masonry: () => import("./demos/masonry"),
  bubbles: () => import("./demos/bubbles"),
  "rich-note": () => import("./demos/rich-note"),
  "justification-comparison": () => import("./demos/justification-comparison"),
  "variable-typographic-ascii": () =>
    import("./demos/variable-typographic-ascii"),
  "dynamic-layout": () => import("./demos/dynamic-layout"),
  "editorial-engine": () => import("./demos/editorial-engine"),
  "markdown-chat": () => import("./demos/markdown-chat"),
};

class ComparePretext extends Entity {
  private W = 0;
  private H = 0;
  private launcher: Group;
  private activeDemo: Entity | null = null;
  private loadSeq = 0;
  private backChip: Card;

  constructor() {
    super("ComparePretext");
    this.launcher = new Group();
    this.add(this.launcher);
    this.buildLauncher();

    // A light pill sitting immediately to the RIGHT of the gallery shell's
    // own "← Gallery" chip (top-left), not stacked under it. Shell chip exits
    // the whole creation; this one steps back from an open sub-demo to the
    // launcher grid.
    this.backChip = new Card({
      width: 118,
      height: 34,
      bg: "rgba(253, 252, 250, 0.94)",
      border: WARM.accentSoft,
      borderWidth: 1,
      radius: 17,
      label: "Back to all demos",
      onClick: () => this.closeDemo(),
    });
    const backLabel = new Text("← All demos", {
      font: FONT.sans(13, 600),
      color: WARM.ink,
    });
    backLabel.setPosition(14, 21);
    this.backChip.add(backLabel);
    this.backChip.setPosition(BACK_CHIP_X, BACK_CHIP_Y);
    this.backChip.opacity = 0;
  }

  private buildLauncher(): void {
    const eyebrow = new Text("PRETEXT, REBUILT ON VECTOJS", {
      font: FONT.mono(12),
      color: WARM.accent,
    });
    eyebrow.setPosition(0, 40);
    const heading = new Text("Demos", {
      font: FONT.serifDisplay(34),
      color: WARM.ink,
    });
    heading.setPosition(0, 60);
    const intro = new Text(
      "Nine public pretext demos, reimplemented on VectoJS's own canvas-native text layout engine — no DOM reflow to avoid, because there was never any DOM to reflow.",
      {
        font: FONT.sans(14),
        color: WARM.muted,
        maxWidth: 620,
        lineHeight: 21,
      },
    );
    intro.setPosition(0, 92);
    this.launcher.add(eyebrow, heading, intro);

    for (const card of DEMO_CARDS) {
      const built = LOADERS[card.id] !== undefined;
      const tile = new Card({
        width: 0, // sized by layoutLauncher()
        height: CARD_H,
        bg: WARM.panel,
        border: WARM.rule,
        borderWidth: 1,
        radius: CARD_RADIUS,
        label: card.title,
        onClick: built ? () => void this.openDemo(card.id) : undefined,
      });
      tile.opacity = built ? 1 : 0.55;
      const title = new Text(card.title, {
        font: FONT.sans(18, 600),
        color: WARM.ink,
      });
      title.setPosition(CARD_PAD, CARD_PAD + 4);
      const desc = new Text(card.description, {
        font: FONT.sans(13),
        color: WARM.muted,
        maxWidth: 300, // corrected per-card in layoutLauncher()
        lineHeight: 18,
      });
      desc.setPosition(CARD_PAD, CARD_PAD + 28);
      tile.add(title, desc);
      (tile as Card & { __demoId?: string }).__demoId = card.id;
      (tile as Card & { __desc?: Text }).__desc = desc;
      this.launcher.add(tile);
    }
  }

  private layoutLauncher(): void {
    const gridWidth = Math.min(GRID_MAX_WIDTH, this.W - 64);
    const left = Math.max(32, (this.W - gridWidth) / 2);
    const cols = this.W < 760 ? 1 : 2;
    const cardW = cols === 1 ? gridWidth : (gridWidth - CARD_GAP) / 2;

    this.launcher.children[0].setPosition(left, 40); // eyebrow
    this.launcher.children[1].setPosition(left, 60); // heading
    this.launcher.children[2].setPosition(left, 92); // intro

    let x = left;
    let y = GRID_TOP;
    let col = 0;
    for (let i = 3; i < this.launcher.children.length; i++) {
      const tile = this.launcher.children[i] as Card & { __desc?: Text };
      tile.width = cardW;
      tile.setPosition(x, y);
      if (tile.__desc) tile.__desc.setMaxWidth(cardW - CARD_PAD * 2);
      col++;
      if (col >= cols) {
        col = 0;
        x = left;
        y += CARD_H + CARD_GAP;
      } else {
        x += cardW + CARD_GAP;
      }
    }
  }

  isPointInside(): boolean {
    return false; // pure container — children own their own hit-testing
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    this.layoutLauncher();
    if (this.activeDemo && hasResizeTo(this.activeDemo)) {
      this.activeDemo.resizeTo(width, height);
    }
  }

  render(_r: IRenderer): void {
    // Purely structural — the launcher's own Text/Card children and the
    // mounted sub-demo entity draw themselves through the normal tree walk.
  }

  private async openDemo(id: string): Promise<void> {
    const loader = LOADERS[id];
    if (!loader) return;
    const seq = ++this.loadSeq;
    const { default: DemoClass } = await loader();
    if (seq !== this.loadSeq) return;

    this.launcher.opacity = 0;
    this.launcher.setPosition(-100000, -100000); // park off-tree so its Cards stop being hit-testable while a demo is open
    this.activeDemo = new DemoClass();
    this.add(this.activeDemo);
    if (hasResizeTo(this.activeDemo)) this.activeDemo.resizeTo(this.W, this.H);

    this.add(this.backChip);
    this.backChip.opacity = 1;
    this.scene?.markDirty();
  }

  private closeDemo(): void {
    if (this.activeDemo) {
      this.activeDemo.destroy();
      this.remove(this.activeDemo);
      this.activeDemo = null;
    }
    this.loadSeq++;
    this.remove(this.backChip);
    this.backChip.opacity = 0;
    this.launcher.opacity = 1;
    this.launcher.setPosition(0, 0);
    this.scene?.markDirty();
  }

  override destroy(): void {
    this.activeDemo?.destroy();
    super.destroy();
  }
}

export default ComparePretext;
