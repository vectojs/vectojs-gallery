/**
 * Variable Typographic ASCII — port of pretext's variable-typographic-ascii
 * demo ("Typographic halftone").
 *
 * A small particle swarm chases two moving attractors; each particle splats a
 * soft radius into a brightness field. That field is downsampled into a
 * character grid twice: a classic fixed-ramp monospace column, and a
 * proportional column that, per cell, picks the glyph (from a weight/style
 * palette) whose measured brightness AND measured width best match the target
 * — the part that needs real per-glyph text measurement, which pretext gets
 * from its layout engine and VectoJS gets from the same canvas `measureText`
 * path its own `LayoutEngine` uses. Both grids are painted via `IRenderer`.
 */
import { Entity, type IRenderer } from "@vectojs/core";
import { DARK, FONT as UIFONT } from "../shared/theme";
import { CONTENT_TOP, drawDemoHeader } from "../shared/chrome";

const COLS = 44;
const ROWS = 26;
const GLYPH_FONT_SIZE = 13;
const CELL_W = 8.5;
const CELL_H = 15;
const FIELD_OVERSAMPLE = 2;
const FIELD_COLS = COLS * FIELD_OVERSAMPLE;
const FIELD_ROWS = ROWS * FIELD_OVERSAMPLE;
const SIM_W = 200;
const SIM_H = Math.round(SIM_W * ((ROWS * CELL_H) / (COLS * CELL_W)));
const FIELD_SCALE_X = FIELD_COLS / SIM_W;
const FIELD_SCALE_Y = FIELD_ROWS / SIM_H;
const PARTICLE_N = 110;
const SPRITE_R = 13;
const ATTRACTOR_R = 12;
const LARGE_ATTRACTOR_R = 28;
const ATTRACTOR_FORCE_1 = 0.22;
const ATTRACTOR_FORCE_2 = 0.05;
const FIELD_DECAY = 0.82;
const PROP_FAMILY = 'Georgia, Palatino, "Times New Roman", serif';
const CHARSET =
  ".,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const WEIGHTS = [300, 500, 800] as const;
const STYLES = ["normal", "italic"] as const;
const MONO_RAMP = " .`-_:,;^=+/|)\\!?0oOQ#%@";

interface PaletteEntry {
  char: string;
  font: string;
  color: string;
  brightness: number;
  width: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface FieldStamp {
  radiusX: number;
  radiusY: number;
  sizeX: number;
  values: Float32Array;
}
interface LookupEntry {
  monoChar: string;
  prop: PaletteEntry | null;
}

function spriteAlphaAt(nd: number): number {
  if (nd >= 1) return 0;
  if (nd <= 0.35) return 0.45 + (0.15 - 0.45) * (nd / 0.35);
  return 0.15 * (1 - (nd - 0.35) / 0.65);
}

class VariableTypographicAsciiDemo extends Entity {
  private W = 0;
  private H = 0;
  private particles: Particle[] = [];
  private field = new Float32Array(FIELD_COLS * FIELD_ROWS);
  private palette: PaletteEntry[] = [];
  private lookup: LookupEntry[] = [];
  private particleStamp!: FieldStamp;
  private largeStamp!: FieldStamp;
  private smallStamp!: FieldStamp;
  private time = 0;
  // reusable per-frame cell buffers (avoid per-frame allocation)
  private monoGrid: string[] = Array.from({ length: COLS * ROWS }, () => " ");
  private propGrid: (PaletteEntry | null)[] = Array.from(
    { length: COLS * ROWS },
    () => null,
  );
  private gridLeftMono = 0;
  private gridLeftProp = 0;
  private gridTop = 0;

  constructor() {
    super("VariableTypographicAsciiDemo");
    this.buildPalette();
    this.buildLookup();
    this.particleStamp = this.createStamp(SPRITE_R);
    this.largeStamp = this.createStamp(LARGE_ATTRACTOR_R);
    this.smallStamp = this.createStamp(ATTRACTOR_R);
    for (let i = 0; i < PARTICLE_N; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * 40 + 20;
      this.particles.push({
        x: SIM_W / 2 + Math.cos(a) * rad,
        y: SIM_H / 2 + Math.sin(a) * rad,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
      });
    }
  }

  private buildPalette(): void {
    const c =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    const mctx = c?.getContext("2d") ?? null;
    // brightness sampler
    const bc =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    if (bc) {
      bc.width = 24;
      bc.height = 24;
    }
    const bctx = bc?.getContext("2d", { willReadFrequently: true }) ?? null;

    const estimateBrightness = (ch: string, font: string): number => {
      if (!bctx) return 0.5;
      bctx.clearRect(0, 0, 24, 24);
      bctx.font = font;
      bctx.fillStyle = "#fff";
      bctx.textBaseline = "middle";
      bctx.fillText(ch, 1, 12);
      const data = bctx.getImageData(0, 0, 24, 24).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      return sum / (255 * 24 * 24);
    };
    const measureWidth = (ch: string, font: string): number => {
      if (!mctx) return GLYPH_FONT_SIZE * 0.5;
      mctx.font = font;
      return mctx.measureText(ch).width;
    };

    for (const style of STYLES) {
      for (const weight of WEIGHTS) {
        const font = `${style === "italic" ? "italic " : ""}${weight} ${GLYPH_FONT_SIZE}px ${PROP_FAMILY}`;
        for (const ch of CHARSET) {
          const width = measureWidth(ch, font);
          if (width <= 0) continue;
          this.palette.push({
            char: ch,
            font,
            color: "#e8e6e1",
            brightness: estimateBrightness(ch, font),
            width,
          });
        }
      }
    }
    const maxB = Math.max(...this.palette.map((e) => e.brightness), 0.0001);
    for (const e of this.palette) e.brightness /= maxB;
    this.palette.sort((a, b) => a.brightness - b.brightness);
  }

  private findBest(target: number): PaletteEntry {
    const p = this.palette;
    let lo = 0;
    let hi = p.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (p[mid].brightness < target) lo = mid + 1;
      else hi = mid;
    }
    const targetCellW = CELL_W;
    let bestScore = Infinity;
    let best = p[lo];
    const start = Math.max(0, lo - 15);
    const end = Math.min(p.length, lo + 15);
    for (let i = start; i < end; i++) {
      const e = p[i];
      const bErr = Math.abs(e.brightness - target) * 2.5;
      const wErr = Math.abs(e.width - targetCellW) / targetCellW;
      const score = bErr + wErr;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private buildLookup(): void {
    for (let byte = 0; byte < 256; byte++) {
      const brightness = byte / 255;
      const monoChar =
        MONO_RAMP[
          Math.min(MONO_RAMP.length - 1, (brightness * MONO_RAMP.length) | 0)
        ];
      if (brightness < 0.03) {
        this.lookup.push({ monoChar, prop: null });
        continue;
      }
      this.lookup.push({ monoChar, prop: this.findBest(brightness) });
    }
  }

  private createStamp(radiusPx: number): FieldStamp {
    const frx = radiusPx * FIELD_SCALE_X;
    const fry = radiusPx * FIELD_SCALE_Y;
    const radiusX = Math.ceil(frx);
    const radiusY = Math.ceil(fry);
    const sizeX = radiusX * 2 + 1;
    const sizeY = radiusY * 2 + 1;
    const values = new Float32Array(sizeX * sizeY);
    for (let y = -radiusY; y <= radiusY; y++) {
      for (let x = -radiusX; x <= radiusX; x++) {
        const nd = Math.sqrt((x / frx) ** 2 + (y / fry) ** 2);
        values[(y + radiusY) * sizeX + x + radiusX] = spriteAlphaAt(nd);
      }
    }
    return { radiusX, radiusY, sizeX, values };
  }

  private splat(cx: number, cy: number, stamp: FieldStamp): void {
    const gcx = Math.round(cx * FIELD_SCALE_X);
    const gcy = Math.round(cy * FIELD_SCALE_Y);
    for (let y = -stamp.radiusY; y <= stamp.radiusY; y++) {
      const gy = gcy + y;
      if (gy < 0 || gy >= FIELD_ROWS) continue;
      const fieldRow = gy * FIELD_COLS;
      const stampRow = (y + stamp.radiusY) * stamp.sizeX;
      for (let x = -stamp.radiusX; x <= stamp.radiusX; x++) {
        const gx = gcx + x;
        if (gx < 0 || gx >= FIELD_COLS) continue;
        const v = stamp.values[stampRow + x + stamp.radiusX];
        if (v === 0) continue;
        const idx = fieldRow + gx;
        this.field[idx] = Math.min(1, this.field[idx] + v);
      }
    }
  }

  isPointInside(): boolean {
    return false;
  }

  hasPendingAnimations(): boolean {
    return true; // continuously animated swarm
  }

  update(dt: number): void {
    super.update(dt, 0);
    this.time += dt;
    const now = this.time;
    const a1x = Math.cos(now * 0.0007) * SIM_W * 0.25 + SIM_W / 2;
    const a1y = Math.sin(now * 0.0011) * SIM_H * 0.3 + SIM_H / 2;
    const a2x = Math.cos(now * 0.0013 + Math.PI) * SIM_W * 0.2 + SIM_W / 2;
    const a2y = Math.sin(now * 0.0009 + Math.PI) * SIM_H * 0.25 + SIM_H / 2;

    for (const p of this.particles) {
      const d1x = a1x - p.x;
      const d1y = a1y - p.y;
      const d2x = a2x - p.x;
      const d2y = a2y - p.y;
      const dist1 = d1x * d1x + d1y * d1y;
      const dist2 = d2x * d2x + d2y * d2y;
      const ax = dist1 < dist2 ? d1x : d2x;
      const ay = dist1 < dist2 ? d1y : d2y;
      const dist = Math.sqrt(Math.min(dist1, dist2)) + 1;
      const force = dist1 < dist2 ? ATTRACTOR_FORCE_1 : ATTRACTOR_FORCE_2;
      p.vx += (ax / dist) * force + (Math.random() - 0.5) * 0.25;
      p.vy += (ay / dist) * force + (Math.random() - 0.5) * 0.25;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -SPRITE_R) p.x += SIM_W + SPRITE_R * 2;
      if (p.x > SIM_W + SPRITE_R) p.x -= SIM_W + SPRITE_R * 2;
      if (p.y < -SPRITE_R) p.y += SIM_H + SPRITE_R * 2;
      if (p.y > SIM_H + SPRITE_R) p.y -= SIM_H + SPRITE_R * 2;
    }

    for (let i = 0; i < this.field.length; i++) this.field[i] *= FIELD_DECAY;
    for (const p of this.particles) this.splat(p.x, p.y, this.particleStamp);
    this.splat(a1x, a1y, this.largeStamp);
    this.splat(a2x, a2y, this.smallStamp);

    // downsample field → grids
    for (let row = 0; row < ROWS; row++) {
      const fieldRowStart = row * FIELD_OVERSAMPLE * FIELD_COLS;
      for (let col = 0; col < COLS; col++) {
        const fieldColStart = col * FIELD_OVERSAMPLE;
        let b = 0;
        for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
          const off = fieldRowStart + sy * FIELD_COLS + fieldColStart;
          for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++)
            b += this.field[off + sx];
        }
        const byte = Math.min(
          255,
          ((b / (FIELD_OVERSAMPLE * FIELD_OVERSAMPLE)) * 255) | 0,
        );
        const entry = this.lookup[byte];
        const cell = row * COLS + col;
        this.monoGrid[cell] = entry.monoChar;
        this.propGrid[cell] = entry.prop;
      }
    }
    this.scene?.markDirty();
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.width = width;
    this.height = height;
    const gridW = COLS * CELL_W;
    const gap = 48;
    const totalW = gridW * 2 + gap;
    const left = Math.max(32, (width - totalW) / 2);
    this.gridLeftMono = left;
    this.gridLeftProp = left + gridW + gap;
    this.gridTop = CONTENT_TOP + 24;
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.W, this.H, 0);
    r.fill(DARK.page);
    drawDemoHeader(
      r,
      32,
      "Typographic halftone",
      "A particle swarm rendered twice — a fixed monospace ramp, and glyphs chosen by measured brightness and width.",
      true,
    );

    // column labels
    r.fillText(
      "MONOSPACE RAMP",
      this.gridLeftMono,
      this.gridTop - 12,
      UIFONT.mono(11),
      DARK.faint,
    );
    r.fillText(
      "PROPORTIONAL (measured)",
      this.gridLeftProp,
      this.gridTop - 12,
      UIFONT.mono(11),
      DARK.accentSoft,
    );

    const monoFont = UIFONT.mono(GLYPH_FONT_SIZE);
    for (let row = 0; row < ROWS; row++) {
      const y = this.gridTop + row * CELL_H + GLYPH_FONT_SIZE;
      // monospace column: one string per row
      let line = "";
      for (let col = 0; col < COLS; col++)
        line += this.monoGrid[row * COLS + col];
      r.fillText(line, this.gridLeftMono, y, monoFont, "#d7d4cd");

      // proportional column: per-cell glyph on a fixed cell grid
      for (let col = 0; col < COLS; col++) {
        const e = this.propGrid[row * COLS + col];
        if (!e) continue;
        r.fillText(
          e.char,
          this.gridLeftProp + col * CELL_W,
          y,
          e.font,
          e.color,
        );
      }
    }
  }
}

export default VariableTypographicAsciiDemo;
