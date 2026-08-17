import { type A11yAttributes, Entity } from '@vectojs/core';
import { isInsideBox } from './hitTest';
import type { RawRenderer } from './raw-renderer';

/**
 * SearchBar — canvas-native find overlay for the Stream Reader.
 *
 * A real DOM `<input>` holds the query (IME/clipboard — the one place a DOM
 * element is correct); everything else is Canvas2D: the bar background, the
 * `N / M` counter, and the prev / next / close buttons. Keyboard is routed
 * through the input (`Enter` next, `Shift+Enter` prev, `Escape` close).
 */

export interface SearchCallbacks {
  onQuery: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

const BAR_H = 44;
const BTN = 28;
const BTN_GAP = 6;
const PAD = 12;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class SearchBar extends Entity {
  public query = '';
  public count = 0;
  public current = 0; // 0-based index into matches; -1 when none

  private cbs: SearchCallbacks;
  private input: HTMLInputElement;
  private _visible = false;
  private _hoveredButton: 'prev' | 'next' | 'close' | null = null;

  constructor(cbs: SearchCallbacks) {
    super('SearchBar');
    this.cbs = cbs;
    this.height = BAR_H;
    this.interactive = true;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Find in document';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    Object.assign(this.input.style, {
      position: 'fixed',
      background: 'rgba(255,255,255,0.95)',
      color: '#3d2e1a',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '8px',
      padding: '6px 10px',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      width: '220px',
      outline: 'none',
      zIndex: '101',
      display: 'none',
    });
    document.body.appendChild(this.input);

    this.input.addEventListener('input', () => {
      this.query = this.input.value;
      this.cbs.onQuery(this.query);
    });
    this.input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.input.focus();
        this.input.select();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.cbs[e.shiftKey ? 'onPrev' : 'onNext']();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.cbs.onClose();
      }
    });

    this.on('click', (e) => this.handleClick(e));
    this.on('pointermove', (e) => this.handleMove(e));
    this.on('pointerleave', () => {
      this._hoveredButton = null;
    });
  }

  get visible(): boolean {
    return this._visible;
  }

  open(): void {
    this._visible = true;
    this.opacity = 1;
    this.interactive = true;
    this.input.style.display = 'block';
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this._visible = false;
    this.opacity = 0;
    this.interactive = false;
    this.input.style.display = 'none';
    this.input.blur();
  }

  /** Set the result counter; `current` is 0-based, or -1 for "no results". */
  setResults(count: number, current: number): void {
    this.count = count;
    this.current = current;
    this.scene?.markDirty();
  }

  clearQuery(): void {
    this.query = '';
    this.input.value = '';
  }

  focusInput(): void {
    this.input.focus();
    this.input.select();
  }

  /** Local anchor (top-left of the input) for CSS positioning by the caller. */
  getInputAnchor(): { x: number; y: number } {
    const g = this.geometry();
    return { x: g.input.x, y: g.input.y + 3 };
  }

  positionInput(cssLeft: number, cssTop: number): void {
    Object.assign(this.input.style, {
      left: `${cssLeft}px`,
      top: `${cssTop}px`,
    });
  }

  destroy(): void {
    this.input.remove();
    super.destroy();
  }

  override getA11yAttributes(): A11yAttributes {
    if (!this._visible) return { pointerEvents: 'none' };
    return { role: 'search', label: 'Find in document' };
  }

  private geometry(): {
    input: Rect;
    prev: Rect;
    next: Rect;
    close: Rect;
    countRight: number;
  } {
    const w = this.width || 0;
    const close: Rect = {
      x: w - PAD - BTN,
      y: (BAR_H - BTN) / 2,
      w: BTN,
      h: BTN,
    };
    const next: Rect = {
      x: close.x - BTN_GAP - BTN,
      y: close.y,
      w: BTN,
      h: BTN,
    };
    const prev: Rect = {
      x: next.x - BTN_GAP - BTN,
      y: close.y,
      w: BTN,
      h: BTN,
    };
    const countRight = prev.x - BTN_GAP;
    const input: Rect = {
      x: PAD,
      y: (BAR_H - 28) / 2,
      w: Math.max(80, countRight - PAD - PAD),
      h: 28,
    };
    return { input, prev, next, close, countRight };
  }

  private handleClick(e: { localX?: number; localY?: number }): void {
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const g = this.geometry();
    if (contains(g.prev, x, y)) this.cbs.onPrev();
    else if (contains(g.next, x, y)) this.cbs.onNext();
    else if (contains(g.close, x, y)) this.cbs.onClose();
  }

  private handleMove(e: { localX?: number; localY?: number }): void {
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const g = this.geometry();
    const btn = contains(g.prev, x, y)
      ? 'prev'
      : contains(g.next, x, y)
        ? 'next'
        : contains(g.close, x, y)
          ? 'close'
          : null;
    if (btn !== this._hoveredButton) {
      this._hoveredButton = btn;
      this.scene?.markDirty();
    }
  }

  isPointInside(globalX: number, globalY: number): boolean {
    if (!this._visible) return false;
    return isInsideBox(this, globalX, globalY);
  }

  render(renderer: RawRenderer): void {
    if (!this._visible) return;
    const ctx = renderer.ctx;
    const w = this.width;

    ctx.beginPath();
    ctx.roundRect(0, 0, w, BAR_H, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const g = this.geometry();

    // Counter: "3 / 17" or "no results".
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8c7a65';
    const label =
      this.query.trim() === ''
        ? ''
        : this.count === 0
          ? '0 / 0'
          : `${this.current + 1} / ${this.count}`;
    ctx.fillText(label, g.countRight, BAR_H / 2);

    this.drawButton(ctx, g.prev, this._hoveredButton === 'prev', '▲');
    this.drawButton(ctx, g.next, this._hoveredButton === 'next', '▼');
    this.drawButton(ctx, g.close, this._hoveredButton === 'close', '×');

    ctx.textAlign = 'left';
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    r: Rect,
    hovered: boolean,
    glyph: string,
  ): void {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 7);
    ctx.fillStyle = hovered ? 'rgba(180,130,60,0.18)' : 'rgba(0,0,0,0.03)';
    ctx.fill();
    ctx.strokeStyle = hovered ? 'rgba(180,130,60,0.5)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hovered ? '#9a6d30' : '#5a4a33';
    ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
}

function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
