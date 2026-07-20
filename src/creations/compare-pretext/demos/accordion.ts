/**
 * Accordion — port of pretext's accordion demo ("Finally sane accordion").
 *
 * pretext measures each panel's exact pixel height ahead of time
 * (`prepare()` + `layout()`) so the open/close height transition never jumps
 * or clips. VectoJS never needed a DOM-avoidance trick for that — its
 * `LayoutEngine.prepare()`/`layoutPrepared()` cold/hot split is used here
 * directly to reproduce the same mechanic and the same "Measurement: N lines
 * · Hpx" readout, on an engine that already does this as its normal text
 * path.
 *
 * Structure matches the original: one continuous rounded card, rows split by
 * hairline dividers, meta right-aligned by the filled-triangle chevron, and
 * only one section open at a time (clicking the open one closes it).
 */
import { Entity, Group, LayoutEngine, type IRenderer } from "@vectojs/core";
import { Card, Text } from "@vectojs/ui";
import { WARM, FONT } from "../shared/theme";
import { fontMeasurer } from "../shared/measure";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";

interface AccordionItemSpec {
  id: string;
  title: string;
  text: string;
}

// Same four items as the pretext original, including the Section 4
// mixed-script/bidi/URL/soft-hyphen stress paragraph.
const ITEMS: AccordionItemSpec[] = [
  {
    id: "shipping",
    title: "Section 1",
    text: "Mina cut the release note to three crisp lines, then realized the support caveat still needed one more sentence before it could ship without surprises.",
  },
  {
    id: "ops",
    title: "Section 2",
    text: "The handoff doc now reads like a proper morning checklist instead of a diary entry. Restart the worker, verify the queue drains, and only then mark the incident quiet. If the backlog grows again, page the same owner instead of opening a new thread.",
  },
  {
    id: "research",
    title: "Section 3",
    text: "We learned the hard way that a giant native scroll range can dominate everything else. The bug looked like DOM churn, then like pooling, then like rendering pressure, until the repros were stripped down enough to show the real limit. That changed the fix completely: simplify the DOM, keep virtualization honest, and stop hiding the worst-case path behind caches that only make the common frame look cheaper.",
  },
  {
    id: "mixed",
    title: "Section 4",
    text: 'AGI 春天到了. بدأت الرحلة 🚀 and the long URL is https://example.com/reports/q3?lang=ar&mode=full. Nora wrote "please keep 10\u202f000 rows visible," Mina replied "trans\u00adatlantic labels are still weird."',
  },
];

const COPY_FONT_SIZE = 14;
const COPY_LINE_HEIGHT = 21;
const TITLE_FONT = FONT.sans(17, 600);
const META_FONT = FONT.mono(11);
const COPY_FONT = FONT.sans(14);
const ROW_PAD_X = 24;
const ROW_HEADER_H = 56;
const PANEL_PAD_Y = 4;
const PANEL_PAD_BOTTOM = 20;
const LIST_MAX_WIDTH = 690;

/**
 * One accordion row: a transparent clickable header plus a clipped body that
 * grows/shrinks on toggle. Rows stack inside one shared container card, so
 * the row itself paints no background — only the header text, meta, chevron,
 * a divider, and (when open) the copy.
 */
class AccordionRow extends Group {
  readonly id: string;
  private readonly spec: AccordionItemSpec;
  private readonly hitCard: Card;
  private readonly titleText: Text;
  private readonly meta: Text;
  private readonly chevron: Text;
  private readonly bodyClip: Group;
  private readonly copyText: Text;
  private engine: LayoutEngine;
  expanded = false;
  private innerWidth = 0;
  private panelHeight = 0;
  private rowWidth = 0;
  showDivider = true;

  constructor(spec: AccordionItemSpec, onToggle: (id: string) => void) {
    super();
    this.id = spec.id;
    this.spec = spec;
    this.engine = new LayoutEngine(1e9, 1e9, fontMeasurer(COPY_FONT));

    // Transparent, borderless clickable header region (the container card
    // behind provides the visible background).
    this.hitCard = new Card({
      width: 0,
      height: ROW_HEADER_H,
      bg: "rgba(0,0,0,0)",
      radius: 0,
      label: `${spec.title} — toggle`,
      onClick: () => onToggle(spec.id),
    });
    this.add(this.hitCard);

    this.titleText = new Text(spec.title, {
      font: TITLE_FONT,
      color: WARM.ink,
    });
    this.titleText.setPosition(ROW_PAD_X, 20);
    this.meta = new Text("", { font: META_FONT, color: WARM.faint });
    this.meta.setPosition(200, 22);
    this.chevron = new Text("▶", {
      font: FONT.sans(10),
      color: WARM.accent,
    });
    this.add(this.titleText, this.meta, this.chevron);

    this.bodyClip = new Group();
    this.bodyClip.clipChildren = true;
    this.bodyClip.setPosition(0, ROW_HEADER_H);
    this.copyText = new Text(spec.text, {
      font: COPY_FONT,
      color: WARM.muted,
      lineHeight: COPY_LINE_HEIGHT,
    });
    this.copyText.setPosition(ROW_PAD_X, PANEL_PAD_Y);
    this.bodyClip.add(this.copyText);
    this.bodyClip.height = 0;
    this.add(this.bodyClip);
  }

  /** Re-measure via LayoutEngine's cold pass (mirrors pretext's refreshPrepared). */
  layoutFor(width: number): void {
    this.rowWidth = width;
    this.innerWidth = width - ROW_PAD_X * 2;
    this.hitCard.width = width;
    this.bodyClip.width = width;

    this.engine.maxWidth = this.innerWidth;
    const prepared = this.engine.prepare(this.spec.text, {}, COPY_FONT_SIZE);
    const result = this.engine.layoutPrepared(prepared);
    this.copyText.setMaxWidth(this.innerWidth);

    const lineCount = Math.max(
      1,
      Math.round(result.totalHeight / (COPY_FONT_SIZE * 1.5)),
    );
    // Report the panel's own measured height the same way pretext does:
    // lineCount × lineHeight (pretext uses a 26px line box; ours is 21px).
    const px = lineCount * COPY_LINE_HEIGHT;
    this.meta.setText(`Measurement: ${lineCount} lines · ${px}px`);
    // Right-align the meta text just left of the chevron.
    this.meta.setPosition(width - 40 - this.meta.width, 22);
    this.chevron.setPosition(width - ROW_PAD_X - 4, 20);

    this.panelHeight = Math.ceil(result.totalHeight + PANEL_PAD_BOTTOM);
    if (this.expanded) this.bodyClip.height = this.panelHeight;

    this.width = width;
    this.height = ROW_HEADER_H + (this.expanded ? this.panelHeight : 0);
  }

  setExpanded(expanded: boolean, animate = true): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    this.chevron.setTransition({
      rotation: { duration: 180, easing: "easeOutCubic" },
    });
    this.chevron.rotation = expanded ? Math.PI / 2 : 0;
    const targetH = expanded ? this.panelHeight : 0;
    if (animate) {
      this.bodyClip.animate({ height: targetH }, 180);
    } else {
      this.bodyClip.height = targetH;
    }
    this.height = ROW_HEADER_H + targetH;
  }

  rowHeight(): number {
    return ROW_HEADER_H + (this.expanded ? this.panelHeight : 0);
  }

  render(r: IRenderer): void {
    if (this.showDivider) {
      r.beginPath();
      r.moveTo(ROW_PAD_X, this.rowHeight() - 0.5);
      r.lineTo(this.rowWidth - ROW_PAD_X, this.rowHeight() - 0.5);
      r.stroke(WARM.rule, 1);
    }
  }

  isPointInside(): boolean {
    return false; // hitCard child owns clicks; this draws only the divider
  }
}

class AccordionDemo extends Entity {
  private rows: AccordionRow[] = [];
  private openId: string | null = "shipping";
  private container: Card;
  private W = 0;
  private H = 0;

  constructor() {
    super("AccordionDemo");
    this.container = new Card({
      width: 0,
      height: 0,
      bg: WARM.panel,
      border: WARM.rule,
      borderWidth: 1,
      radius: 16,
    });
    this.container.clipChildren = true;
    this.add(this.container);
    for (const spec of ITEMS) {
      const row = new AccordionRow(spec, (id) => this.toggle(id));
      this.rows.push(row);
      this.container.add(row);
    }
    this.rows[this.rows.length - 1].showDivider = false;
    this.applyOpen(false);
  }

  private toggle(id: string): void {
    this.openId = this.openId === id ? null : id;
    this.applyOpen(true);
    this.reflowList();
    this.scene?.markDirty();
  }

  private applyOpen(animate: boolean): void {
    for (const row of this.rows)
      row.setExpanded(row.id === this.openId, animate);
  }

  private reflowList(): void {
    let y = 0;
    for (const row of this.rows) {
      row.setPosition(0, y);
      y += row.rowHeight();
    }
    this.container.height = y;
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    const listWidth = Math.min(LIST_MAX_WIDTH, width - 64);
    const left = Math.max(32, (width - listWidth) / 2);
    this.container.width = listWidth;
    this.container.setPosition(left, CONTENT_TOP);
    for (const row of this.rows) row.layoutFor(listWidth);
    this.reflowList();
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(WARM.page);
    const listWidth = Math.min(LIST_MAX_WIDTH, this.W - 64);
    const left = Math.max(32, (this.W - listWidth) / 2);
    drawDemoHeader(
      r,
      left,
      "Finally sane accordion",
      "The section heights are calculated without measuring the DOM and without CSS hacks.",
    );
  }
}

export default AccordionDemo;
