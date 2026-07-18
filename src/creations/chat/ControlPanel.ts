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
 * We use a real <input type="number"> element for the rate field so the OS
 * handles IME, clipboard, and keyboard routing — as mandated by the VectoJS
 * paradigm ("the ONE place a real DOM element is correct").
 * Everything else is pure Canvas2D Entity rendering.
 */

import { Entity } from "@vectojs/core";
import type { StreamState } from "./state";
import { isInsideBox } from "./hitTest";
import type { RawRenderer } from "./raw-renderer";

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
  private _rateInput: HTMLInputElement;
  // slider drag
  private _sliderDragging = false;

  get isMobile(): boolean {
    return (this.width || 800) < 640;
  }

  get btnW(): number {
    return this.isMobile ? 54 : 76;
  }

  get panelHeight(): number {
    return this.isMobile ? 90 : 56;
  }

  // Computed deterministically from this.width — no need to wait for render.
  private computeSliderGeom(): { sliderX: number; sliderW: number } {
    const isMob = this.isMobile;
    const bw = this.btnW;
    const gap = isMob ? 6 : GAP;
    const sliderX = isMob ? PAD + 16 : PAD + 4 * (bw + gap) + 32;
    const sliderW = isMob
      ? Math.max(100, (this.width || 375) - sliderX - PAD - 150)
      : Math.max(150, Math.min(350, (this.width || 800) - sliderX - 220));
    return { sliderX, sliderW };
  }

  constructor(cbs: ControlCallbacks) {
    super("ControlPanel");
    this.cbs = cbs;
    this.interactive = true;
    this.height = this.panelHeight;

    // Real <input> for rate — positioned via CSS, synced with canvas state
    this._rateInput = document.createElement("input");
    this._rateInput.type = "number";
    this._rateInput.min = "0";
    this._rateInput.max = "10000";
    this._rateInput.step = "10";
    this._rateInput.value = "100";
    Object.assign(this._rateInput.style, {
      position: "fixed",
      background: "rgba(255,255,255,0.9)",
      color: "#3d2e1a",
      border: "1px solid rgba(0,0,0,0.12)",
      borderRadius: "6px",
      padding: "4px 8px",
      fontFamily: "monospace",
      fontSize: "13px",
      width: "80px",
      outline: "none",
      zIndex: "100",
      display: "none",
    });
    document.body.appendChild(this._rateInput);

    this._rateInput.addEventListener("input", () => {
      const v = Math.max(0, Math.min(10000, Number(this._rateInput.value)));
      cbs.onRateChange(v);
    });
    this._rateInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") {
        cbs.onRateChange(Math.min(10000, (this.state?.tokenRate ?? 100) + 10));
        e.preventDefault();
      }
      if (e.key === "ArrowDown") {
        cbs.onRateChange(Math.max(0, (this.state?.tokenRate ?? 100) - 10));
        e.preventDefault();
      }
    });

    // Buttons: use 'click' which is the most reliable VectoJS event from the a11y overlay.
    // Slider drag: use pointerdown/pointermove/pointerup.
    // Do NOT bind both 'click' AND 'pointerdown' to handleDown — that causes double-triggers.
    this.on("click", (e) => this.handleClick(e));
    this.on("pointermove", (e) => this.handleMove(e));
    this.on("pointerdown", (e) => this.handleSliderDown(e));
    this.on("pointerup", () => {
      this._sliderDragging = false;
    });
    this.on("pointerleave", () => {
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
  getInputLocalAnchor(): { x: number; y: number } {
    const { sliderX, sliderW } = this.computeSliderGeom();
    const isMob = this.isMobile;
    const y = isMob
      ? 45 + (45 - 28) / 2 // Row 2 center
      : (this.panelHeight - 28) / 2; // Single row center
    return { x: sliderX + sliderW + 40, y };
  }

  /** Place the DOM rate input at explicit CSS pixel coordinates. */
  positionInput(cssLeft: number, cssTop: number): void {
    Object.assign(this._rateInput.style, {
      left: `${cssLeft}px`,
      top: `${cssTop}px`,
      display: "block",
    });
  }

  /** Hide the DOM rate input (e.g. while another creation is mounted). */
  hideInput(): void {
    this._rateInput.style.display = "none";
  }

  /** Sync input value from state */
  syncRate(rate: number) {
    if (document.activeElement !== this._rateInput) {
      this._rateInput.value = String(rate);
    }
  }

  private buildButtons() {
    const isMob = this.isMobile;
    const bw = this.btnW;
    const gap = isMob ? 6 : GAP;
    this.btns = [
      {
        id: "file",
        label: isMob ? "📂" : "📂 File",
        x: PAD,
        color: "#1e293b",
        hoverColor: "#334155",
        action: this.cbs.onFileOpen,
        hovered: false,
      },
      {
        id: "play",
        label: isMob ? "▶" : "▶ Play",
        x: PAD + 1 * (bw + gap),
        color: "#064e3b",
        hoverColor: "#065f46",
        action: this.cbs.onPlay,
        hovered: false,
      },
      {
        id: "pause",
        label: isMob ? "⏸" : "⏸ Pause",
        x: PAD + 2 * (bw + gap),
        color: "#1e3a5f",
        hoverColor: "#1e40af",
        action: this.cbs.onPause,
        hovered: false,
      },
      {
        id: "stop",
        label: isMob ? "🧹" : "🧹 Clean",
        x: PAD + 3 * (bw + gap),
        color: "#475569",
        hoverColor: "#64748b",
        action: this.cbs.onStop,
        hovered: false,
      },
    ];
  }

  // No manual localPos() needed — VectoJSEvent.localX/localY are already
  // transformed into this entity's local coordinate space.

  private handleMove(e: { localX?: number; localY?: number }) {
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const isMob = this.isMobile;
    const btnY = isMob ? (45 - BTN_H) / 2 : (this.panelHeight - BTN_H) / 2;
    const bw = this.btnW;
    for (const b of this.btns) {
      b.hovered = x >= b.x && x <= b.x + bw && y >= btnY && y <= btnY + BTN_H;
    }
    if (this._sliderDragging) {
      const { sliderX, sliderW } = this.computeSliderGeom();
      const t = Math.max(0, Math.min(1, (x - sliderX) / sliderW));
      this.cbs.onRateChange(Math.round(t * 10000));
    }
  }

  /** Handles button clicks via 'click' event only (no slider). */
  private handleClick(e: { localX?: number; localY?: number }) {
    const x = e.localX ?? 0;
    const y = e.localY ?? 0;
    const isMob = this.isMobile;
    const btnY = isMob ? (45 - BTN_H) / 2 : (this.panelHeight - BTN_H) / 2;
    const bw = this.btnW;
    for (const b of this.btns) {
      if (x >= b.x && x <= b.x + bw && y >= btnY && y <= btnY + BTN_H) {
        b.action();
        return;
      }
    }
  }

  /** Handles slider drag start via 'pointerdown' only (no buttons). */
  private handleSliderDown(e: { localX?: number; localY?: number }) {
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
    this.buildButtons();

    const ctx = renderer.ctx;
    const w = this.width;
    const h = this.panelHeight;
    const isMob = this.isMobile;

    // Panel background — matches page bg, only buttons stand out
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 0);
    ctx.fillStyle = "#f7f2e8";
    ctx.fill();
    // Subtle top border
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();

    if (isMob) {
      ctx.strokeStyle = "rgba(0,0,0,0.04)";
      ctx.beginPath();
      ctx.moveTo(PAD, 45);
      ctx.lineTo(w - PAD, 45);
      ctx.stroke();
    }
    ctx.restore();

    const btnY = isMob ? (45 - BTN_H) / 2 : (h - BTN_H) / 2;
    const bw = this.btnW;

    // Buttons
    for (const b of this.btns) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(b.x, btnY, bw, BTN_H, 8);
      ctx.fillStyle = b.hovered ? b.hoverColor : b.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = isMob ? "bold 14px sans-serif" : "bold 12px sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
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
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fill();

    // Fill
    const rate = this.state?.tokenRate ?? 100;
    const t = rate / 10000;
    ctx.beginPath();
    ctx.roundRect(sliderLeft, sliderY - 3, sliderW * t, 6, 3);
    ctx.fillStyle = "#b4823c";
    ctx.fill();

    // Thumb
    ctx.beginPath();
    ctx.arc(sliderLeft + sliderW * t, sliderY, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#c49a54";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.font = "11px monospace";
    ctx.fillStyle = "#9e8e78";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("0", sliderLeft - 14, sliderY);
    ctx.fillText("10k", sliderLeft + sliderW + 14, sliderY);

    ctx.restore();

    // tok/s label (right of input: input width is 80px, spaced by 40px + 80px + 8px)
    const inputRight = sliderLeft + sliderW + 40 + 80 + 8;
    ctx.font = "11px monospace";
    ctx.fillStyle = "#9e8e78";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("tok/s", inputRight, sliderY);

    // File name + progress
    if (this.state?.fileName) {
      const pct =
        this.state.tokens.length > 0
          ? Math.round((this.state.cursor / this.state.tokens.length) * 100)
          : 0;
      const label = `${this.state.fileName}  ${pct}%  [${this.state.status.toUpperCase()}]${this.state.loop ? "  🔁" : ""}`;
      ctx.font = "11px monospace";
      ctx.fillStyle = "#8c7a65";
      ctx.textAlign = "right";
      ctx.fillText(label, w - PAD, isMob ? 45 / 2 : h / 2);
    }
  }

  destroy() {
    this._rateInput.remove();
    super.destroy();
  }
}
