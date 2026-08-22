/**
 * ControlPanel — bottom docked controls.
 *
 * Layout (left → right):
 *   [File] [▶/⏸ Play/Pause] [⏹ Stop] [🔁 Loop]  ··  Rate: [input] tok/s  ··  Progress: ██░░ N%  ·  filename
 *
 * The token rate input supports:
 *   - Direct keyboard number entry (0–10000)
 *   - Arrow keys (±10)
 *   - Mouse drag on the slider track
 *
 * The rate field is an @vectojs/ui Input, whose projected native input lets the
 * OS handle IME, clipboard, and keyboard routing. Buttons and the Slider are
 * retained child entities; this class owns only the surrounding painted chrome.
 */

import { Entity } from '@vectojs/core';
import { Button, Input, Slider } from '@vectojs/ui';
import type { StreamState } from './state';
import { isInsideBox } from './hitTest';
import type { RawRenderer } from './raw-renderer';

class SemanticButton extends Button {
  override getA11yAttributes() {
    return super.getA11yAttributes();
  }
}

class SemanticSlider extends Slider {
  override getA11yAttributes() {
    return super.getA11yAttributes();
  }
}

class RateInput extends Input {
  override getA11yAttributes() {
    return {
      ...super.getA11yAttributes(),
      inputType: 'number',
      label: 'Token rate value',
      valuemin: '0',
      valuemax: '10000',
    };
  }
}

type Callback = () => void;

export interface ControlCallbacks {
  onFileOpen: Callback;
  onPlay: Callback;
  onPause: Callback;
  onStop: Callback;
  onToggleLoop: Callback;
  onRateChange: (newRate: number) => void;
}

const BTN_H = 32;
const GAP = 8;
const PAD = 16;
/**
 * Token-rate row metrics, in one place because four call sites derive positions
 * from them — the input anchor, the layout pass, the `tok/s` label, and the status
 * clamp — and they drifted into repeated literals (`+ 40 + 80 + 8`).
 *
 * `RATE_INPUT_GAP` also has to clear the slider's own `10k` max label, which is
 * centred just past the track end: at 40px the label sat mid-gap about 26px from
 * the input, so `10k`, the value and `tok/s` crowded into one narrow band and read
 * as a single run of text.
 */
const RATE_INPUT_W = 80;
const RATE_INPUT_H = 28;
const RATE_INPUT_GAP = 64;
/** Centre offset of the slider's `0` / `10k` end labels, past each track end. */
const RATE_TICK_OFFSET = 16;
/** The unit label drawn right of the rate input; measured, never hardcoded. */
const TOK_S_LABEL = 'tok/s';
/** Clear gap between that label's end and where the desktop status may start. */
const STATUS_LABEL_GAP = 12;

interface Btn {
  id: string;
  label: string;
  x: number;
  color: string;
  hoverColor: string;
  action: Callback;
  hovered: boolean;
}

export class ControlPanel extends Entity {
  public state!: StreamState;
  private cbs: ControlCallbacks;
  private btns: Btn[] = [];
  // slider drag
  private _sliderDragging = false;
  private semanticButtons: Button[] = [];
  private rateSlider: Slider;
  private rateInput: RateInput;

  get isMobile(): boolean {
    // The creation loses the gallery rail width before this panel sees its
    // available width. A 1280px viewport leaves roughly 1000px here, which is
    // already too narrow for the desktop row once a filename is present.
    return (this.width || 800) < 1120;
  }

  get btnW(): number {
    return this.isMobile ? 54 : 76;
  }

  get panelHeight(): number {
    return this.isMobile ? 124 : 56;
  }

  get semanticControls(): readonly (Button | Input | Slider)[] {
    return [this.rateInput, this.rateSlider, ...this.semanticButtons];
  }

  // The panel owns canvas hit-testing for its custom-painted buttons and slider,
  // while the child controls own the projected DOM semantics. Without this,
  // the panel's full-width a11y box sits above every child and intercepts clicks
  // before the projected Open/Play/Pause controls can receive them.
  override getA11yAttributes() {
    return { pointerEvents: 'none' as const };
  }

  // Computed deterministically from this.width — no need to wait for render.
  private computeSliderGeom(): { sliderX: number; sliderW: number } {
    const isMob = this.isMobile;
    const bw = this.btnW;
    const gap = isMob ? 6 : GAP;
    const sliderX = isMob ? PAD + 16 : PAD + 5 * (bw + gap) + 32;
    const sliderW = isMob
      ? Math.max(100, (this.width || 375) - sliderX - PAD - 150)
      : Math.max(150, Math.min(350, (this.width || 800) - sliderX - 220));
    return { sliderX, sliderW };
  }

  constructor(cbs: ControlCallbacks) {
    super('ControlPanel');
    this.cbs = cbs;
    this.interactive = true;
    this.height = this.panelHeight;

    this.rateSlider = new SemanticSlider({
      min: 0,
      max: 10000,
      value: 100,
      step: 10,
      label: 'Token rate slider',
      onChange: (value: number) => this.cbs.onRateChange(value),
    });
    this.rateSlider.opacity = 0;
    this.add(this.rateSlider);
    this.rateInput = new RateInput({
      width: RATE_INPUT_W,
      height: RATE_INPUT_H,
      value: '100',
      font: '13px monospace',
      color: '#3d2e1a',
      bg: 'rgba(255,255,255,0.9)',
      border: 'rgba(0,0,0,0.12)',
      onChange: (value) => {
        const rate = Math.max(0, Math.min(10000, Number(value)));
        if (Number.isFinite(rate)) this.cbs.onRateChange(rate);
      },
    });
    this.rateInput.on('keydown', (event) => {
      const key = event.nativeEvent?.key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
      const delta = key === 'ArrowUp' ? 10 : -10;
      this.cbs.onRateChange(Math.max(0, Math.min(10000, (this.state?.tokenRate ?? 100) + delta)));
      event.preventDefault?.();
    });
    this.add(this.rateInput);
    this.semanticButtons = [
      new SemanticButton('Open file', { onClick: cbs.onFileOpen }),
      new SemanticButton('Play', { onClick: cbs.onPlay }),
      new SemanticButton('Pause', { onClick: cbs.onPause }),
      new SemanticButton('Clean', { onClick: cbs.onStop }),
      new SemanticButton('Toggle loop', { onClick: cbs.onToggleLoop }),
    ];
    for (const button of this.semanticButtons) {
      button.opacity = 0;
      this.add(button);
    }

    // Buttons: use 'click' which is the most reliable VectoJS event from the a11y overlay.
    // Slider drag: use pointerdown/pointermove/pointerup.
    // Do NOT bind both 'click' AND 'pointerdown' to handleDown — that causes double-triggers.
    this.on('click', (e) => this.handleClick(e));
    this.on('pointermove', (e) => this.handleMove(e));
    this.on('pointerdown', (e) => this.handleSliderDown(e));
    this.on('pointerup', () => {
      this._sliderDragging = false;
    });
    this.on('pointerleave', () => {
      this._sliderDragging = false;
      this.btns.forEach((b) => (b.hovered = false));
    });
  }

  isPointInside(globalX: number, globalY: number): boolean {
    return isInsideBox(this, globalX, globalY);
  }

  /**
   * This entity's local anchor point for the rate `<input>` (40px right of
   * the slider end, vertically centered in its row). The Gallery embeds this
   * creation inside one shared full-window canvas at a screen-space offset
   * (the rail width), so converting this into real CSS pixels needs the
   * caller's own global position + canvas scale — kept out of this class so
   * it doesn't need to know about the shell it's embedded in.
   */
  private getRateInputAnchor(): { x: number; y: number } {
    const { sliderX, sliderW } = this.computeSliderGeom();
    const isMob = this.isMobile;
    const y = isMob
      ? 45 + (45 - RATE_INPUT_H) / 2 // Rate row center
      : (this.panelHeight - RATE_INPUT_H) / 2; // Single row center
    return { x: sliderX + sliderW + RATE_INPUT_GAP, y };
  }

  private layoutSemanticControls(): void {
    const isMob = this.isMobile;
    const bw = this.btnW;
    const gap = isMob ? 6 : GAP;
    const btnY = isMob ? (45 - BTN_H) / 2 : (this.panelHeight - BTN_H) / 2;
    this.semanticButtons.forEach((button, index) => {
      const x = PAD + index * (bw + gap);
      button.setPosition(x, btnY);
      button.width = bw;
      button.height = BTN_H;
    });
    this.semanticButtons[4]?.setLabel(`Loop: ${this.state?.loop ? 'on' : 'off'}`);
    const { sliderX, sliderW } = this.computeSliderGeom();
    this.rateSlider.setPosition(sliderX, isMob ? 45 + 45 / 2 - 12 : this.panelHeight / 2 - 12);
    this.rateSlider.width = sliderW;
    this.rateSlider.height = 24;
    this.rateSlider.value = this.state?.tokenRate ?? this.rateSlider.value;
    // Both coordinates come from the one anchor helper. This site previously
    // recomputed x itself, so the gap existed twice and could drift.
    const rateAnchor = this.getRateInputAnchor();
    this.rateInput.setPosition(rateAnchor.x, rateAnchor.y);
  }

  /** Sync input value from state */
  syncRate(rate: number) {
    if (!this.rateInput.focused) this.rateInput.value = String(rate);
    this.rateSlider.value = rate;
  }

  /** Keep a long local filename from painting over the controls beside it. */
  private fitLabel(text: string, maxWidth: number, measure: (value: string) => number): string {
    if (maxWidth <= 0) return '';
    if (measure(text) <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && measure(`${text.slice(0, end)}...`) > maxWidth) end--;
    return end > 1 ? `${text.slice(0, end)}...` : '...';
  }

  private buildButtons() {
    const isMob = this.isMobile;
    const bw = this.btnW;
    const gap = isMob ? 6 : GAP;
    this.btns = [
      {
        id: 'file',
        label: isMob ? '📂' : '📂 File',
        x: PAD,
        color: '#1e293b',
        hoverColor: '#334155',
        action: this.cbs.onFileOpen,
        hovered: false,
      },
      {
        id: 'play',
        label: isMob ? '▶' : '▶ Play',
        x: PAD + 1 * (bw + gap),
        color: '#064e3b',
        hoverColor: '#065f46',
        action: this.cbs.onPlay,
        hovered: false,
      },
      {
        id: 'pause',
        label: isMob ? '⏸' : '⏸ Pause',
        x: PAD + 2 * (bw + gap),
        color: '#1e3a5f',
        hoverColor: '#1e40af',
        action: this.cbs.onPause,
        hovered: false,
      },
      {
        id: 'stop',
        label: isMob ? '🧹' : '🧹 Clean',
        x: PAD + 3 * (bw + gap),
        color: '#475569',
        hoverColor: '#64748b',
        action: this.cbs.onStop,
        hovered: false,
      },
      {
        id: 'loop',
        label: isMob ? '↻' : '↻ Loop',
        x: PAD + 4 * (bw + gap),
        color: '#59442c',
        hoverColor: '#765b3a',
        action: this.cbs.onToggleLoop,
        hovered: false,
      },
    ];
  }

  // No manual localPos() needed — VectoJSEvent.localX/localY are already
  // transformed into this entity's local coordinate space.

  private handleMove(e: { localX?: number; localY?: number; target?: Entity }) {
    if (e.target && e.target !== this) return;
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const isMob = this.isMobile;
    const btnY = isMob ? (45 - BTN_H) / 2 : (this.panelHeight - BTN_H) / 2;
    const bw = this.btnW;
    for (let index = 0; index < this.btns.length; index++) {
      const b = this.btns[index];
      b.hovered = x >= b.x && x <= b.x + bw && y >= btnY && y <= btnY + BTN_H;
    }
    if (this._sliderDragging) {
      const { sliderX, sliderW } = this.computeSliderGeom();
      const t = Math.max(0, Math.min(1, (x - sliderX) / sliderW));
      this.cbs.onRateChange(Math.round(t * 10000));
    }
  }

  /** Handles button clicks via 'click' event only (no slider). */
  private handleClick(e: { localX?: number; localY?: number; target?: Entity }) {
    if (e.target && e.target !== this) return;
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const isMob = this.isMobile;
    const btnY = isMob ? (45 - BTN_H) / 2 : (this.panelHeight - BTN_H) / 2;
    const bw = this.btnW;
    for (let index = 0; index < this.btns.length; index++) {
      const b = this.btns[index];
      if (x >= b.x && x <= b.x + bw && y >= btnY && y <= btnY + BTN_H) {
        b.action();
        return;
      }
    }
  }

  /** Handles slider drag start via 'pointerdown' only (no buttons). */
  private handleSliderDown(e: { localX?: number; localY?: number; target?: Entity }) {
    if (e.target && e.target !== this) return;
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const isMob = this.isMobile;
    const sliderY_ = isMob ? 45 + 45 / 2 : this.panelHeight / 2;
    const { sliderX: sx, sliderW: sw } = this.computeSliderGeom();
    if (Math.abs(y - sliderY_) < 16 && x >= sx && x <= sx + sw) {
      this._sliderDragging = true;
      const t = (x - sx) / sw;
      this.cbs.onRateChange(Math.round(t * 10000));
    }
  }

  render(renderer: RawRenderer) {
    this.layoutSemanticControls();
    this.buildButtons();

    const ctx = renderer.ctx;
    const w = this.width;
    const h = this.panelHeight;
    const isMob = this.isMobile;

    // Panel background — matches page bg, only buttons stand out
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 0);
    ctx.fillStyle = '#f7f2e8';
    ctx.fill();
    // Subtle top border
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();

    if (isMob) {
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.beginPath();
      ctx.moveTo(PAD, 45);
      ctx.lineTo(w - PAD, 45);
      ctx.stroke();
    }
    ctx.restore();

    const btnY = isMob ? (45 - BTN_H) / 2 : (h - BTN_H) / 2;
    const bw = this.btnW;

    // Buttons
    for (let index = 0; index < this.btns.length; index++) {
      const b = this.btns[index];
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(b.x, btnY, bw, BTN_H, 8);
      ctx.fillStyle = b.hovered ? b.hoverColor : b.color;
      ctx.fill();
      const semantic = this.semanticButtons[index];
      ctx.strokeStyle = semantic?.focused ? '#b4823c' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = semantic?.focused ? 2 : 1;
      ctx.stroke();

      ctx.font = isMob ? 'bold 14px sans-serif' : 'bold 12px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + bw / 2, btnY + BTN_H / 2);
      ctx.restore();
    }

    // Rate slider
    const { sliderX: sliderLeft, sliderW } = this.computeSliderGeom();
    const sliderY = isMob ? 45 + 45 / 2 : h / 2;

    ctx.save();
    // Track
    ctx.beginPath();
    ctx.roundRect(sliderLeft, sliderY - 3, sliderW, 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    // Fill
    const rate = this.state?.tokenRate ?? 100;
    const t = rate / 10000;
    ctx.beginPath();
    ctx.roundRect(sliderLeft, sliderY - 3, sliderW * t, 6, 3);
    ctx.fillStyle = '#b4823c';
    ctx.fill();

    // Thumb
    ctx.beginPath();
    ctx.arc(sliderLeft + sliderW * t, sliderY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#c49a54';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (this.rateSlider.focused) {
      ctx.beginPath();
      ctx.arc(sliderLeft + sliderW * t, sliderY, 11, 0, Math.PI * 2);
      ctx.strokeStyle = '#9a6d30';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.font = '11px monospace';
    ctx.fillStyle = '#9e8e78';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('0', sliderLeft - RATE_TICK_OFFSET, sliderY);
    ctx.fillText('10k', sliderLeft + sliderW + RATE_TICK_OFFSET, sliderY);

    ctx.restore();

    // tok/s label (right of input: input width is 80px, spaced by 40px + 80px + 8px)
    const inputRight = sliderLeft + sliderW + RATE_INPUT_GAP + RATE_INPUT_W + GAP;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#9e8e78';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(TOK_S_LABEL, inputRight, sliderY);

    // File name + token progress. Compact layouts use the second row for the
    // status so it never competes with the token-rate input on the first row.
    if (this.state?.fileName) {
      const pct =
        this.state.tokens.length > 0
          ? Math.round((this.state.cursor / this.state.tokens.length) * 100)
          : 0;
      ctx.font = '11px monospace';
      ctx.fillStyle = '#5f4931';
      ctx.textAlign = isMob ? 'left' : 'right';
      const statusY = isMob ? h - 16 : h / 2;
      const statusX = isMob ? PAD : w - PAD;
      // Desktop status is right-aligned and must clear the `tok/s` label,
      // which is drawn left-aligned at inputRight: reserving only up to
      // inputRight + GAP let the status overlap the label's glyphs (seen live
      // as "tdofomula.md"). Reserve the measured label width plus a 12px gap.
      const tokLabelWidth = ctx.measureText(TOK_S_LABEL).width;
      const statusWidth = isMob
        ? w - PAD * 2
        : Math.max(0, w - PAD - (inputRight + tokLabelWidth + STATUS_LABEL_GAP));
      const status = `${this.state.cursor.toLocaleString()}/${this.state.tokens.length.toLocaleString()} tok  ${pct}%  ${this.state.status.toUpperCase()}`;
      const label = this.fitLabel(
        `${this.state.fileName}  ${status}${this.state.loop ? '  LOOP' : ''}`,
        statusWidth,
        (value) => ctx.measureText(value).width,
      );
      ctx.fillText(label, statusX, statusY);
    }
  }

  destroy() {
    this.rateInput.destroy();
    this.rateSlider.destroy();
    for (const button of this.semanticButtons) button.destroy();
    super.destroy();
  }
}
