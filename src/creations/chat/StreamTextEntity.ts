/**
 * StreamTextEntity — the hot rendering core for plain-text/EPUB streaming.
 *
 * Renders the streamed `visible` text as a word-wrapped block directly on
 * the Canvas2D context. Supports:
 *   - Configurable font, line height, padding
 *   - Automatic line wrapping at `this.width - 2*padding`
 *   - Scrolls to keep the latest line in view (auto-scroll when at bottom)
 *   - Manual scroll via wheel / drag (disables auto-scroll until bottom)
 *   - Text selection + copy via the VectoJS semantic projection layer
 *
 * Performance notes:
 *   - We never rebuild the full layout every frame.  Instead we maintain a
 *     `lines[]` array and only re-wrap from `dirtyFromLine` onwards when new
 *     characters arrive or width changes.
 *   - At 10 000 tok/s (~10 chars/frame at 60 fps) only the last line is ever
 *     re-wrapped, so layout cost is O(1) per frame in practice.
 */

import {
  Entity,
  LayoutEngine,
  type Bounds,
  type PreparedText,
} from "@vectojs/core";
import { isInsideBox } from "./hitTest";
import type { RawRenderer } from "./raw-renderer";

export interface ParagraphLayout {
  text: string;
  prepared: PreparedText | null;
  lines: string[];
  height: number;
}

export interface StreamTextOptions {
  font?: string;
  color?: string;
  lineHeight?: number;
  padding?: number;
  selectable?: boolean;
}

function fontSizePx(font: string): number {
  const match = font.match(/(\d+)px/);
  return match ? parseInt(match[1], 10) : 16;
}

function fontMeasurer(font: string) {
  if (typeof document === "undefined") return null;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  const cache = new Map<string, number>();
  return {
    measure(char: string, _fontSize: number): number {
      let w = cache.get(char);
      if (w === undefined) {
        ctx.font = font;
        w = ctx.measureText(char).width;
        cache.set(char, w);
      }
      return w;
    },
  };
}

const DEFAULTS: Required<StreamTextOptions> = {
  font: '16px/1.6 "JetBrains Mono", "Fira Code", monospace',
  color: "#2d2015",
  lineHeight: 26,
  padding: 32,
  selectable: true,
};

export class StreamTextEntity extends Entity {
  // ── Options ────────────────────────────────────────────────────────────────
  font: string;
  color: string;
  lineHeight: number;
  padding: number;

  // ── Layout engine ──────────────────────────────────────────────────────────
  private engine: LayoutEngine;
  private fontSize: number;
  private projectionNode: TextProjectionEntity;

  // ── Paragraph Virtualization Cache ─────────────────────────────────────────
  private paragraphs: ParagraphLayout[] = [];
  private _prevVisible = "";
  private _prevWidth = 0;
  private _totalHeightCache = 0;
  private _shown = true;

  /**
   * Show/hide the stream surface (opacity + hit-testing + render skip).
   * Distinct from `visibleText` (the streamed character buffer).
   */
  get visible(): boolean {
    return this._shown;
  }
  set visible(v: boolean) {
    this._shown = v;
    this.interactive = v;
    this.opacity = v ? 1 : 0;
  }

  get totalLinesCount(): number {
    let count = 0;
    for (const p of this.paragraphs) {
      count += p.lines.length;
    }
    return count;
  }

  get visibleTextInViewport(): string {
    let text = "";
    const pad = this.padding;
    const h = this.height || 600;
    let currentY = pad;
    for (const p of this.paragraphs) {
      const pHeight = p.height;
      const isVisible =
        currentY + pHeight > this.scrollY && currentY < this.scrollY + h;
      if (isVisible) {
        text += p.text;
      }
      currentY += pHeight;
    }
    return text;
  }

  // ── Scroll state ───────────────────────────────────────────────────────────
  private scrollY = 0; // logical scroll offset in px (0 = top)
  private autoScroll = true; // snap to bottom when new content arrives
  private _dragY = 0;
  private _dragging = false;
  private _scrollbarDragging = false;
  private _scrollOffset = 0;

  // ── Public state (written by StreamState tick) ─────────────────────────────
  public visibleText = "";
  /** When set, show this as idle hint (no stream active). */
  public idleHint = "";

  constructor(opts: StreamTextOptions = {}) {
    super("StreamText");
    this.font = opts.font ?? DEFAULTS.font;
    this.color = opts.color ?? DEFAULTS.color;
    this.lineHeight = opts.lineHeight ?? DEFAULTS.lineHeight;
    this.padding = opts.padding ?? DEFAULTS.padding;
    this.fontSize = fontSizePx(this.font);
    this.engine = new LayoutEngine(
      800 - this.padding * 2,
      1e9,
      fontMeasurer(this.font),
    );
    this.interactive = true;

    // VectoJS dispatches VectoJSEvent — use localX/localY and deltaY
    this.on("wheel", (e) => {
      const dy = e.deltaY ?? 0;
      const oldY = this.scrollY;
      this.scrollY += dy;
      this.clampScroll();
      if (!this.isAtBottom()) this.autoScroll = false;
      if (this.scrollY !== oldY) this.scene?.markDirty();
    });

    this.on("pointerdown", (e) => {
      const x = e.localX ?? 0;
      const y = e.localY ?? 0;
      const w = this.width || 800;
      const h = this.height || 600;

      // Scrollbar click/drag detection (rightmost 16px)
      const sbH = Math.max(40, (h / this.totalHeight()) * h);
      if (this.totalHeight() > h && x >= w - 16) {
        this._scrollbarDragging = true;
        const sbY = (this.scrollY / this.maxScrollY()) * (h - sbH);
        if (y >= sbY && y <= sbY + sbH) {
          this._scrollOffset = y - sbY;
        } else {
          this._scrollOffset = sbH / 2;
          const t = Math.max(0, Math.min(1, (y - sbH / 2) / (h - sbH)));
          this.scrollY = t * this.maxScrollY();
          this.scene?.markDirty();
        }
        return;
      }

      // Drag to scroll is touch-only (leaves mouse drag for text selection)
      if (e.nativeEvent?.pointerType === "touch") {
        this._dragging = true;
        this._dragY = y;
      }
    });

    this.on("pointermove", (e) => {
      const y = e.localY ?? 0;

      if (this._scrollbarDragging) {
        const h = this.height || 600;
        const sbH = Math.max(40, (h / this.totalHeight()) * h);
        const availableY = h - sbH;
        if (availableY > 0) {
          const targetSbY = y - this._scrollOffset;
          const t = Math.max(0, Math.min(1, targetSbY / availableY));
          this.scrollY = t * this.maxScrollY();
          this.clampScroll();
          this.autoScroll = false;
          this.scene?.markDirty();
        }
        return;
      }

      if (this._dragging) {
        const dy = this._dragY - y;
        this._dragY = y;
        const oldY = this.scrollY;
        this.scrollY += dy;
        this.clampScroll();
        if (!this.isAtBottom()) this.autoScroll = false;
        if (this.scrollY !== oldY) this.scene?.markDirty();
      }
    });

    this.on("pointerup", () => {
      this._dragging = false;
      this._scrollbarDragging = false;
    });

    this.projectionNode = new TextProjectionEntity(this);
    this.add(this.projectionNode);
  }

  isPointInside(globalX: number, globalY: number): boolean {
    if (!this._shown) return false;
    return isInsideBox(this, globalX, globalY);
  }

  /** Local bounds of currently on-screen paragraphs (for a11y projection). */
  getProjectionLocalBounds(): Bounds {
    return {
      x: 0,
      y: 0,
      width: this.width || 800,
      height: this.height || 600,
    };
  }

  // ── Scroll helpers ─────────────────────────────────────────────────────────

  private totalHeight(): number {
    return this._totalHeightCache + this.padding * 2;
  }

  private maxScrollY(): number {
    return Math.max(0, this.totalHeight() - (this.height || 600));
  }

  private clampScroll() {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY(), this.scrollY));
  }

  private isAtBottom(): boolean {
    return this.scrollY >= this.maxScrollY() - 2;
  }

  private layoutParagraph(p: ParagraphLayout) {
    if (!p.text) {
      p.lines = [];
      p.height = 0;
      return;
    }
    p.prepared = this.engine.prepare(p.text, {}, this.fontSize);
    const result = this.engine.layoutPrepared(p.prepared);

    const lineQuantum = this.fontSize * 1.5;
    const byLine = new Map<number, string>();
    let maxIdx = -1;

    for (const node of result.nodes) {
      const idx = Math.round(node.y / lineQuantum);
      byLine.set(idx, (byLine.get(idx) ?? "") + node.char);
      if (idx > maxIdx) maxIdx = idx;
    }

    p.lines = [];
    for (let i = 0; i <= maxIdx; i++) {
      p.lines.push(byLine.get(i) ?? "");
    }
    p.height = Math.max(maxIdx + 1, 1) * this.lineHeight;
  }

  private rebuildAllParagraphsLayout() {
    this._totalHeightCache = 0;
    for (const p of this.paragraphs) {
      this.layoutParagraph(p);
      this._totalHeightCache += p.height;
    }
  }

  private resetParagraphs(fullText: string) {
    this.paragraphs = [];
    const parts = fullText.split("\n");
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const text = parts[i] + (isLast ? "" : "\n");
      this.paragraphs.push({
        text,
        prepared: null,
        lines: [],
        height: 0,
      });
    }
    this.rebuildAllParagraphsLayout();
  }

  private appendTextToParagraphs(addedText: string) {
    if (this.paragraphs.length === 0) {
      this.paragraphs.push({ text: "", prepared: null, lines: [], height: 0 });
      this._totalHeightCache = 0;
    }

    const parts = addedText.split("\n");

    // Append first part to current last paragraph
    const lastPara = this.paragraphs[this.paragraphs.length - 1];
    const prevHeight = lastPara.height;
    lastPara.text += parts[0] + (parts.length > 1 ? "\n" : "");
    this.layoutParagraph(lastPara);
    this._totalHeightCache += lastPara.height - prevHeight;

    // Add remaining parts as new paragraphs
    for (let i = 1; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const text = parts[i] + (isLast ? "" : "\n");
      const newPara: ParagraphLayout = {
        text,
        prepared: null,
        lines: [],
        height: 0,
      };
      this.layoutParagraph(newPara);
      this.paragraphs.push(newPara);
      this._totalHeightCache += newPara.height;
    }
  }

  private updateLayout() {
    const maxW = (this.width || 800) - this.padding * 2;
    if (maxW <= 0) return;

    if (this._prevWidth !== maxW) {
      this.engine.maxWidth = maxW;
      this.rebuildAllParagraphsLayout();
      this._prevWidth = maxW;
    }

    if (this.visibleText !== this._prevVisible) {
      if (this.visibleText.startsWith(this._prevVisible)) {
        const added = this.visibleText.slice(this._prevVisible.length);
        this.appendTextToParagraphs(added);
      } else {
        this.resetParagraphs(this.visibleText);
      }
      this._prevVisible = this.visibleText;
    }
  }

  // ── VectoJS Entity hooks ───────────────────────────────────────────────────

  update(_dt: number) {
    this.updateLayout();

    if (this.autoScroll) {
      this.scrollY = this.maxScrollY();
    }
    this.clampScroll();
  }

  // `interactive = true` above is only for VectoJS's own wheel-scroll routing.
  // Without this, the a11y shadow div for this whole entity sits above (and
  // eats pointer events meant for) the selectable text projected by
  // TextProjectionEntity underneath — see forge/findings.md 2026-07-18
  // (structural-interactive container blocking native text selection).
  override getA11yAttributes() {
    return { pointerEvents: "none" as const };
  }

  render(renderer: RawRenderer) {
    if (!this._shown) return;

    const ctx = renderer.ctx;
    const w = this.width || 800;
    const h = this.height || 600;
    const pad = this.padding;

    // Background
    ctx.fillStyle = "#f7f2e8";
    ctx.fillRect(0, 0, w, h);

    // Clip to viewport
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    ctx.font = this.font;
    ctx.fillStyle = this.color;
    ctx.textBaseline = "top";

    if (this.paragraphs.length === 0 && this.idleHint) {
      // Show centered idle hint
      ctx.font = "18px sans-serif";
      ctx.fillStyle = "#9e8e78";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.idleHint, w / 2, h / 2);
      ctx.textAlign = "start";
    } else {
      let currentY = pad;
      for (const p of this.paragraphs) {
        const pHeight = p.height;
        // Intersect check: render only if paragraph intersects viewport
        const isVisible =
          currentY + pHeight > this.scrollY && currentY < this.scrollY + h;
        if (isVisible) {
          const baseY = currentY - this.scrollY;
          for (let i = 0; i < p.lines.length; i++) {
            const lineY = baseY + i * this.lineHeight;
            if (lineY + this.lineHeight > 0 && lineY < h) {
              ctx.fillText(p.lines[i], pad, lineY);
            }
          }
        }
        currentY += pHeight;
      }
    }

    // Scrollbar
    if (this.totalHeight() > h) {
      const sbH = Math.max(40, (h / this.totalHeight()) * h);
      const sbY = (this.scrollY / this.maxScrollY()) * (h - sbH);
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.roundRect(w - 6, sbY, 4, sbH, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  hasPendingAnimations(): boolean {
    return this.visibleText !== this._prevVisible || this._dragging;
  }

  // ── Scroll to bottom (called externally when stream starts) ────────────────
  scrollToBottom() {
    this.autoScroll = true;
    this.scrollY = this.maxScrollY();
  }

  resetScroll() {
    this.scrollY = 0;
    this.autoScroll = true;
    this.paragraphs = [];
    this._prevVisible = "";
    this._totalHeightCache = 0;
  }
}

/**
 * TextProjectionEntity — bridges the Canvas2D rendering viewport and
 * VectoJS's semantic a11y DOM projection layer.
 *
 * It translates logical parent text offset and scrolls into exact page bounds,
 * outputting a matching transparent DOM div that permits browser native
 * text highlight selection, search, screen-reading, and clipboard copying.
 */
class TextProjectionEntity extends Entity {
  private parentText: StreamTextEntity;

  constructor(parentText: StreamTextEntity) {
    super("TextProjection");
    this.parentText = parentText;
    this.interactive = false;
  }

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override update() {
    // Sync geometry so VectoJS a11y projection matches the on-screen text box.
    const bounds = this.getBounds();
    if (!bounds) return;
    this.x = bounds.x;
    this.y = bounds.y;
    this.width = bounds.width;
    this.height = bounds.height;
  }

  override getBounds(): Bounds {
    return this.parentText.getProjectionLocalBounds();
  }

  override getA11yAttributes() {
    return { label: this.parentText.visibleTextInViewport };
  }

  override getContentProjection() {
    const pad = this.parentText.padding;
    const h = this.parentText.height || 600;

    // Collect exact on-screen coordinates for every visible line, for the
    // browser's native text-selection/search machinery to project onto.
    const lines: {
      text: string;
      x: number;
      y: number;
      baseline: number;
      font: string;
      lineHeight: number;
    }[] = [];
    let currentY = pad;
    let accumulatedText = "";

    const paragraphs = this.parentText["paragraphs"] as {
      height: number;
      lines: string[];
    }[];
    const scrollY = this.parentText["scrollY"] as number;

    for (const p of paragraphs) {
      const pHeight = p.height;
      const isVisible = currentY + pHeight > scrollY && currentY < scrollY + h;

      if (isVisible) {
        const baseY = currentY - scrollY;
        for (let i = 0; i < p.lines.length; i++) {
          const lineY = baseY + i * this.parentText.lineHeight;
          if (lineY + this.parentText.lineHeight > 0 && lineY < h) {
            const lineText = p.lines[i];
            accumulatedText += lineText;
            lines.push({
              text: lineText,
              x: pad, // matches the Canvas render's left margin (pad)
              y: lineY,
              baseline: this.parentText.lineHeight * 0.8, // textBaseline="top" offset
              font: this.parentText.font,
              lineHeight: this.parentText.lineHeight,
            });
          }
        }
      }
      currentY += pHeight;
    }

    if (lines.length === 0) return null;

    return {
      text: accumulatedText,
      font: this.parentText.font,
      lineHeight: this.parentText.lineHeight,
      lines,
      selectable: true,
    };
  }

  render() {
    // Pure semantic projection node — no pixels drawn directly on canvas
  }
}
