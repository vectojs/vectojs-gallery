import { type A11yAttributes, Entity } from '@vectojs/core';
import { Button, Input } from '@vectojs/ui';
import { isInsideBox } from './hitTest';
import type { RawRenderer } from './raw-renderer';

class SemanticButton extends Button {
  override getA11yAttributes() {
    return { ...super.getA11yAttributes(), pointerEvents: 'none' as const };
  }
}

class SearchResultStatus extends Entity {
  public label = 'No search query';

  constructor() {
    super('SearchResultStatus');
    this.interactive = true;
  }

  override getA11yAttributes(): A11yAttributes {
    return { role: 'status', label: this.label, pointerEvents: 'none' };
  }

  override isPointInside(): boolean {
    return false;
  }

  override render(): void {}
}

/**
 * SearchBar — canvas-native find overlay for the Stream Reader.
 *
 * An @vectojs/ui Input holds the query and projects the native input used for
 * IME/clipboard. The result count is a live status entity and prev/next/close
 * are retained Buttons. Keyboard is routed through the Input (`Enter` next,
 * `Shift+Enter` prev, `Escape` close).
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
  private input: Input;
  private _visible = false;
  private _hoveredButton: 'prev' | 'next' | 'close' | null = null;
  private semanticButtons: Button[];
  readonly resultStatus = new SearchResultStatus();

  constructor(cbs: SearchCallbacks) {
    super('SearchBar');
    this.cbs = cbs;
    this.height = BAR_H;
    this.interactive = true;

    this.semanticButtons = [
      new SemanticButton('Previous match', { onClick: cbs.onPrev }),
      new SemanticButton('Next match', { onClick: cbs.onNext }),
      new SemanticButton('Close search', { onClick: cbs.onClose }),
    ];
    for (const button of this.semanticButtons) {
      button.opacity = 0;
      this.add(button);
    }
    this.add(this.resultStatus);

    this.input = new Input({
      width: 220,
      height: 28,
      placeholder: 'Find in document',
      font: '14px system-ui, sans-serif',
      color: '#3d2e1a',
      bg: 'rgba(255,255,255,0.95)',
      border: 'rgba(0,0,0,0.12)',
      onChange: (value) => {
        this.query = value;
        this.cbs.onQuery(value);
      },
    });
    this.add(this.input);
    this.input.on('keydown', (event) => {
      const native = event.nativeEvent;
      if ((native?.ctrlKey || native?.metaKey) && native.key.toLowerCase() === 'f') {
        event.preventDefault?.();
        this.input.focus();
      } else if (native?.key === 'Enter') {
        event.preventDefault?.();
        this.cbs[native.shiftKey ? 'onPrev' : 'onNext']();
      } else if (native?.key === 'Escape') {
        event.preventDefault?.();
        event.stopPropagation?.();
        this.cbs.onClose();
      }
    });

    this.on('click', (e) => this.handleClick(e));
    this.on('pointermove', (e) => this.handleMove(e));
    this.on('pointerleave', () => {
      this._hoveredButton = null;
    });
    this.opacity = 0;
    this.interactive = false;
    this.input.interactive = false;
    this.resultStatus.interactive = false;
    for (const button of this.semanticButtons) button.interactive = false;
  }

  get visible(): boolean {
    return this._visible;
  }

  get semanticControls(): readonly Button[] {
    return this.semanticButtons;
  }

  open(): void {
    this._visible = true;
    this.opacity = 1;
    this.interactive = true;
    this.input.interactive = true;
    this.resultStatus.interactive = true;
    this.input.focus();
    this.layoutSemanticControls();
  }

  close(): void {
    this._visible = false;
    this.opacity = 0;
    this.interactive = false;
    this.input.interactive = false;
    this.resultStatus.interactive = false;
    for (const button of this.semanticButtons) button.interactive = false;
  }

  /** Set the result counter; `current` is 0-based, or -1 for "no results". */
  setResults(count: number, current: number): void {
    this.count = count;
    this.current = current;
    this.resultStatus.label =
      this.query.trim() === ''
        ? 'No search query'
        : count === 0
          ? 'No search results'
          : `Search result ${current + 1} of ${count}`;
    this.scene?.markDirty();
  }

  clearQuery(): void {
    this.query = '';
    this.input.value = '';
  }

  focusInput(): void {
    this.input.focus();
  }

  private layoutSemanticControls(): void {
    const g = this.geometry();
    const rects = [g.prev, g.next, g.close];
    this.semanticButtons.forEach((button, index) => {
      const rect = rects[index];
      button.interactive = this._visible;
      button.setPosition(rect.x, rect.y);
      button.width = rect.w;
      button.height = rect.h;
    });
    this.input.setPosition(g.input.x, g.input.y);
    this.input.width = g.input.w;
    this.input.height = g.input.h;
  }

  override getA11yAttributes(): A11yAttributes {
    if (!this._visible) return { pointerEvents: 'none' };
    const result = this.query.trim()
      ? this.count === 0
        ? 'no results'
        : `${this.current + 1} of ${this.count} results`
      : 'no query';
    return { role: 'search', label: `Find in document, ${result}` };
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

  private handleClick(e: { localX?: number; localY?: number; target?: Entity }): void {
    if (e.target && e.target !== this) return;
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
    this.layoutSemanticControls();
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

    this.drawButton(
      ctx,
      g.prev,
      this._hoveredButton === 'prev',
      this.semanticButtons[0]?.focused ?? false,
      '▲',
    );
    this.drawButton(
      ctx,
      g.next,
      this._hoveredButton === 'next',
      this.semanticButtons[1]?.focused ?? false,
      '▼',
    );
    this.drawButton(
      ctx,
      g.close,
      this._hoveredButton === 'close',
      this.semanticButtons[2]?.focused ?? false,
      '×',
    );

    ctx.textAlign = 'left';
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    r: Rect,
    hovered: boolean,
    focused: boolean,
    glyph: string,
  ): void {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 7);
    ctx.fillStyle = hovered ? 'rgba(180,130,60,0.18)' : 'rgba(0,0,0,0.03)';
    ctx.fill();
    ctx.strokeStyle = focused ? '#9a6d30' : hovered ? 'rgba(180,130,60,0.5)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = focused ? 2 : 1;
    ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hovered ? '#9a6d30' : '#5a4a33';
    ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }

  override destroy(): void {
    for (const button of this.semanticButtons) button.destroy();
    this.input.destroy();
    this.resultStatus.destroy();
    super.destroy();
  }
}

function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
