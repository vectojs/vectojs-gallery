/**
 * PerfPanel — overlaid stats panel (top-right corner).
 *
 * Shows: rendered FPS + measured display Hz | render cost | JS heap.
 * Drawn directly on Canvas2D for minimal overhead.
 *
 * Every field renders `—` when its input has not been measured yet, rather than
 * a stand-in number. A placeholder integer here is indistinguishable on screen
 * from a real reading, which is exactly how this panel previously came to
 * display a hardcoded 60 as though it had measured it.
 */

import { Entity } from '@vectojs/core';
import { Dropdown } from '@vectojs/ui';
import type { PerfSample } from './perf';
import type { RawRenderer } from './raw-renderer';
import { SHELL_MAX_FPS } from '../../shell-config';

/** Health thresholds for the rendered-vs-display rate ratio. */
const RATIO_GOOD = 0.9;
const RATIO_WARN = 0.5;

const COLOR_GOOD = '#22c55e';
const COLOR_WARN = '#f59e0b';
const COLOR_BAD = '#ef4444';
const COLOR_UNKNOWN = '#5c4a35';
/** Panel chrome, shared by the readout rows and the Max FPS control. */
const PANEL_INK = '#3d2e1a';
const PANEL_MUTED = '#9e8e78';
const PANEL_HAIRLINE = 'rgba(0,0,0,0.12)';
const PANEL_ACCENT = '#a0784a';
const UNCAPPED_LABEL = 'Uncapped';
const FPS_OPTIONS = ['30', '60', '120', '144', '240', UNCAPPED_LABEL];

export class PerfPanel extends Entity {
  /**
   * Starts fully unmeasured — every field `NaN`, rendered as `—`.
   *
   * Seeding these with numbers is what made the panel assert 60fps before it had
   * timed a single frame.
   */
  public sample: PerfSample = {
    fps: NaN,
    renderMode: 'onDemand',
    displayHz: NaN,
    rafHz: NaN,
    frameMs: NaN,
    frameIntervalMs: NaN,
    heapUsedMB: NaN,
    heapLimitMB: NaN,
    cpuProxy: NaN,
  };
  private maxFPSDropdown: Dropdown;

  constructor() {
    super('PerfPanel');
    this.width = 180;
    this.height = 128;
    this.interactive = false;
    this.maxFPSDropdown = new Dropdown(FPS_OPTIONS, {
      value: SHELL_MAX_FPS === 0 ? UNCAPPED_LABEL : String(SHELL_MAX_FPS),
      label: 'Maximum FPS',
      width: 104,
      height: 26,
      font: '11px monospace',
      // Every colour is set on purpose. `Dropdown` defaults to a dark slate
      // trigger AND a dark menu, which on this warm translucent panel read as a
      // rendering fault rather than a control — the panel is white at 85% with
      // muted warm text, so the stock navy was the highest-contrast thing on it.
      // The menu colours in particular are not optional: leaving them unset opens
      // a dark popup out of a light trigger.
      bg: 'rgba(255,255,255,0.92)',
      color: PANEL_INK,
      border: PANEL_HAIRLINE,
      menuBg: 'rgba(255,255,255,0.97)',
      menuColor: PANEL_INK,
      menuSelectedBg: 'rgba(160,120,70,0.16)',
      menuHighlightBg: 'rgba(160,120,70,0.30)',
      focusColor: PANEL_ACCENT,
      onChange: (value: string) => {
        if (this.scene) this.scene.maxFPS = value === UNCAPPED_LABEL ? 0 : Number(value);
      },
    });
    this.maxFPSDropdown.setPosition(64, 94);
    this.add(this.maxFPSDropdown);
  }

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  render(renderer: RawRenderer): void {
    const ctx = renderer.ctx;
    const w = this.width;
    const h = this.height;
    const s = this.sample;

    // Light card
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const row = (label: string, value: string, y: number, color = COLOR_UNKNOWN) => {
      ctx.font = '10px monospace';
      ctx.fillStyle = PANEL_MUTED;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 12, y);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = color;
      ctx.fillText(value, w - 12 - ctx.measureText(value).width, y);
    };

    // Health is the rendered cadence against the *measured* display rate. Both
    // must be known for the comparison to mean anything; with either missing the
    // value is drawn neutral rather than being scored against a guess.
    const fpsColor = fpsHealthColor(s.fps, s.displayHz, s.renderMode);

    row('FPS', formatRate(s.fps), 22, fpsColor);
    // `DISPLAY` is the panel's capability. When the page is not actually being
    // given frames at that rate, show what it IS getting next to it rather than
    // leaving a starved session looking healthy — `240 (raf 8)` is legible; a bare
    // `8 Hz` latched at startup, which is what this used to show, is a lie.
    row('DISPLAY', formatDisplayRate(s.displayHz, s.rafHz), 42, starvationColor(s));
    row('RENDER', formatMs(s.frameMs), 62);
    row('HEAP', formatHeap(s.heapUsedMB), 80);
    ctx.font = '10px monospace';
    ctx.fillStyle = PANEL_MUTED;
    ctx.textBaseline = 'middle';
    ctx.fillText('MAX FPS', 12, 107);
  }
}

/**
 * Colors the rendered rate against the measured display rate.
 *
 * Returns the neutral color when either rate is unknown, **or** when the scene
 * is in `onDemand` mode: a parked document legitimately redraws a few times a
 * second, so scoring `fps / displayHz` would paint healthy idle red. Neutral
 * rather than green — the row reports a fact, it does not pass a check.
 */
export function fpsHealthColor(
  fps: number,
  displayHz: number,
  renderMode: 'always' | 'onDemand' = 'always',
): string {
  if (renderMode === 'onDemand') return COLOR_UNKNOWN;
  if (!Number.isFinite(fps) || !Number.isFinite(displayHz) || displayHz <= 0) {
    return COLOR_UNKNOWN;
  }
  const ratio = fps / displayHz;
  if (ratio >= RATIO_GOOD) return COLOR_GOOD;
  if (ratio >= RATIO_WARN) return COLOR_WARN;
  return COLOR_BAD;
}

/** Formats a rate in Hz, or `—` when unmeasured. */
export function formatRate(hz: number): string {
  return Number.isFinite(hz) ? `${Math.round(hz)} Hz` : '—';
}

/** Below this fraction of the display rate, the page is being starved of frames. */
const RAF_STARVED = 0.75;

/**
 * Formats the display rate, annotating the live rAF cadence when it has fallen
 * behind.
 *
 * The bare capability is shown while the page is keeping up, because the second
 * number is noise then. It appears only when it carries information.
 */
export function formatDisplayRate(displayHz: number, rafHz: number): string {
  if (!Number.isFinite(displayHz)) return '—';
  const base = `${Math.round(displayHz)} Hz`;
  if (!Number.isFinite(rafHz) || displayHz <= 0) return base;
  if (rafHz >= displayHz * RAF_STARVED) return base;
  return `${Math.round(displayHz)}←${Math.round(rafHz)}`;
}

/**
 * Colors the display row by whether the page is actually receiving frames.
 *
 * Neutral while keeping up; warm once the live cadence has dropped well below the
 * measured capability, which means either a saturated main thread or a window the
 * compositor has stopped sending frame callbacks to. A page cannot tell those
 * apart — `hasFocus()` and `visibilityState` are identical in both — so this
 * reports the symptom and does not guess the cause.
 */
export function starvationColor(sample: { displayHz: number; rafHz: number }): string {
  const { displayHz, rafHz } = sample;
  if (!Number.isFinite(displayHz) || !Number.isFinite(rafHz) || displayHz <= 0) {
    return COLOR_UNKNOWN;
  }
  return rafHz >= displayHz * RAF_STARVED ? COLOR_UNKNOWN : COLOR_WARN;
}

/** Formats a duration in ms, or `—` when unmeasured. */
export function formatMs(ms: number): string {
  return Number.isFinite(ms) ? `${ms} ms` : '—';
}

/** Formats a heap reading in MB, or `N/A` where the API is unavailable. */
export function formatHeap(mb: number): string {
  return Number.isFinite(mb) ? `${mb.toFixed(1)} MB` : 'N/A';
}
