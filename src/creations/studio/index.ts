import { Entity } from "@vectojs/core";
import type { IRenderer } from "@vectojs/core";
import { COLOR } from "../../ui/tokens";

/**
 * Canvas Studio — a small Fabric.js-style interactive object model rebuilt on
 * VectoJS. It is deliberately NOT a wrapper around a `<canvas>` context: every
 * shape is a plain numeric record in the `shapes` array, every handle is a
 * point computed from that record's transform, and hit-testing is arithmetic
 * on those numbers (see the vectojs-paradigm skill — debug in state space, not
 * pixel space). What Fabric gives you out of the box, this demonstrates from
 * first principles:
 *
 *   - draggable / resizable / rotatable objects with an oriented selection box
 *   - 8 scale handles (opposite edge/corner stays pinned) + a rotate handle
 *   - marquee band-select and multi-object group move
 *   - z-order (bring to front / send to back)
 *   - JSON serialize + rebuild (the round-trip Fabric is famous for)
 *
 * Kept intentionally simple: groups move but don't scale/rotate as a unit, and
 * there is no free-hand drawing — those are the natural next increments.
 */

const TAU = Math.PI * 2;
const HANDLE = 5; // half-size of a square handle, in px
const HIT_TOL = 9; // pointer distance that still counts as "on" a handle
const ROTATE_ARM = 26; // gap between the top edge and the rotate knob
const MIN_SIZE = 16; // smallest a shape may be scaled to

type ShapeType = "rect" | "ellipse" | "text";

interface Shape {
  id: number;
  type: ShapeType;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number; // radians
  fill: string;
  text?: string;
}

/** JSON shape record used by the save/load round-trip. */
interface ShapeDTO {
  type: ShapeType;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  fill: string;
  text?: string;
}

const PALETTE = [
  "#4f46e5",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#3d3529",
  "#faf7f1",
] as const;

const STORAGE_KEY = "vectojs-studio-scene";

type DragMode = "none" | "move" | "resize" | "rotate" | "marquee";

interface ToolButton {
  key: string;
  label: string;
  x: number;
  w: number;
}

// The renderer draws text left-aligned and has no measureText, so widths are
// approximated from the glyph count (matches the `catch` creation's approach).
const approxW = (text: string, px: number): number => text.length * px * 0.56;

function ctext(
  r: IRenderer,
  text: string,
  cx: number,
  baseline: number,
  px: number,
  color: string,
  weight = 600,
): void {
  r.fillText(
    text,
    cx - approxW(text, px) / 2,
    baseline,
    `${weight} ${px}px Inter, system-ui`,
    color,
  );
}

class CanvasStudio extends Entity {
  W = 0;
  H = 0;

  private shapes: Shape[] = [];
  private selection = new Set<number>();
  private nextId = 1;
  private inited = false;

  private currentFill: string = PALETTE[0];

  // Drag state.
  private drag: DragMode = "none";
  private dragStart = { x: 0, y: 0 };
  private handleAxis = { hx: 0, hy: 0 };
  private anchor = { x: 0, y: 0 }; // pinned world point during a resize
  private moveOrigins = new Map<number, { cx: number; cy: number }>();
  private marquee = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private hoverCursor = "default";

  private savedBytes = 0;
  private toast = { msg: "", t: 0 };

  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    super("CanvasStudio");
    this.canvas = document.getElementById(
      "gallery-canvas",
    ) as HTMLCanvasElement | null;
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("dblclick", this.onDblClick);
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("keydown", this.onKeyDown);
    }
  }

  resizeTo(width: number, height: number): void {
    this.W = width;
    this.H = height;
    if (!this.inited) {
      this.initDefault();
      this.inited = true;
    }
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: this.W, height: this.H };
  }

  // Reads pointer input directly (like `catch`), so it opts out of engine
  // hit-testing entirely.
  isPointInside(): boolean {
    return false;
  }

  override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("dblclick", this.onDblClick);
      this.canvas.style.cursor = "default";
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    super.destroy();
  }

  // --- model helpers -------------------------------------------------------

  private initDefault(): void {
    const loaded = this.tryLoad(false);
    if (loaded) return;
    const cx = this.W / 2;
    const cy = this.H / 2;
    this.shapes = [
      this.make("rect", cx - 150, cy - 40, 190, 120, 0, PALETTE[0]),
      this.make("ellipse", cx + 120, cy + 30, 150, 150, 0, PALETTE[1]),
      this.make("text", cx - 40, cy + 150, 0, 0, 0, PALETTE[6], "VectoJS"),
    ];
    this.fitText(this.shapes[2]);
  }

  private make(
    type: ShapeType,
    cx: number,
    cy: number,
    w: number,
    h: number,
    rot: number,
    fill: string,
    text?: string,
  ): Shape {
    return { id: this.nextId++, type, cx, cy, w, h, rot, fill, text };
  }

  private fontSizeOf(s: Shape): number {
    return Math.max(10, s.h * 0.72);
  }

  private fitText(s: Shape): void {
    if (s.type !== "text") return;
    const px = s.h > 0 ? this.fontSizeOf(s) : 34;
    if (s.h <= 0) s.h = px / 0.72;
    s.w = Math.max(40, approxW(s.text ?? "", this.fontSizeOf(s)) + 8);
  }

  private byId(id: number): Shape | undefined {
    return this.shapes.find((s) => s.id === id);
  }

  private selShapes(): Shape[] {
    return this.shapes.filter((s) => this.selection.has(s.id));
  }

  // --- geometry ------------------------------------------------------------

  // Local (shape-space) corner/edge point → world, applying the shape's
  // rotation about its own center. hx/hy in {-1,0,1}.
  private worldPoint(
    s: Shape,
    hx: number,
    hy: number,
  ): { x: number; y: number } {
    const lx = (hx * s.w) / 2;
    const ly = (hy * s.h) / 2;
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    return { x: s.cx + lx * c - ly * sn, y: s.cy + lx * sn + ly * c };
  }

  private rotateHandlePoint(s: Shape): { x: number; y: number } {
    const ly = -s.h / 2 - ROTATE_ARM;
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    return { x: s.cx - ly * sn, y: s.cy + ly * c };
  }

  // World point → shape-local, inverse of worldPoint's rotation.
  private toLocal(s: Shape, x: number, y: number): { x: number; y: number } {
    const dx = x - s.cx;
    const dy = y - s.cy;
    const c = Math.cos(-s.rot);
    const sn = Math.sin(-s.rot);
    return { x: dx * c - dy * sn, y: dx * sn + dy * c };
  }

  private hitShape(x: number, y: number): Shape | null {
    // Top-most first (later shapes paint on top).
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      const p = this.toLocal(s, x, y);
      if (Math.abs(p.x) <= s.w / 2 && Math.abs(p.y) <= s.h / 2) return s;
    }
    return null;
  }

  private static readonly HANDLE_AXES: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];

  // If exactly one shape is selected, return the handle under (x,y).
  private hitHandle(
    x: number,
    y: number,
  ): { kind: "resize" | "rotate"; hx: number; hy: number } | null {
    if (this.selection.size !== 1) return null;
    const s = this.selShapes()[0];
    if (!s) return null;
    const rp = this.rotateHandlePoint(s);
    if (Math.hypot(x - rp.x, y - rp.y) <= HIT_TOL)
      return { kind: "rotate", hx: 0, hy: 0 };
    for (const [hx, hy] of CanvasStudio.HANDLE_AXES) {
      const p = this.worldPoint(s, hx, hy);
      if (Math.hypot(x - p.x, y - p.y) <= HIT_TOL)
        return { kind: "resize", hx, hy };
    }
    return null;
  }

  private groupBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    const sel = this.selShapes();
    if (sel.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of sel) {
      for (const [hx, hy] of CanvasStudio.HANDLE_AXES) {
        const p = this.worldPoint(s, hx, hy);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { minX, minY, maxX, maxY };
  }

  // --- toolbar -------------------------------------------------------------

  private static readonly TOOL_Y = 60;
  private static readonly TOOL_H = 38;
  private static readonly SWATCH = 22;

  private toolButtons(): ToolButton[] {
    const defs: { key: string; label: string }[] = [
      { key: "rect", label: "+ Rect" },
      { key: "ellipse", label: "+ Ellipse" },
      { key: "text", label: "+ Text" },
      { key: "front", label: "Front" },
      { key: "back", label: "Back" },
      { key: "delete", label: "Delete" },
      { key: "save", label: "Save" },
      { key: "load", label: "Load" },
    ];
    const gap = 8;
    const padX = 12;
    const px = 13;
    const btns: ToolButton[] = [];
    let total = 0;
    const widths = defs.map((d) => Math.round(approxW(d.label, px) + padX * 2));
    total = widths.reduce((a, b) => a + b, 0) + gap * (defs.length - 1);
    const swatchesW =
      PALETTE.length * (CanvasStudio.SWATCH + 6) + 18; /* separator */
    total += swatchesW;
    // Center within the safe band (clear of the back chip / fullscreen chip).
    const safeLeft = 180;
    const safeRight = this.W - 60;
    let x = Math.max(safeLeft, (safeLeft + safeRight) / 2 - total / 2);
    for (let i = 0; i < defs.length; i++) {
      btns.push({ key: defs[i].key, label: defs[i].label, x, w: widths[i] });
      x += widths[i] + gap;
    }
    return btns;
  }

  private swatchStartX(): number {
    const btns = this.toolButtons();
    const last = btns[btns.length - 1];
    return last.x + last.w + 18;
  }

  private hitToolbar(x: number, y: number): boolean {
    const ty = CanvasStudio.TOOL_Y;
    if (y < ty || y > ty + CanvasStudio.TOOL_H) return false;
    for (const b of this.toolButtons()) {
      if (x >= b.x && x <= b.x + b.w) {
        this.onTool(b.key);
        return true;
      }
    }
    // Colour swatches.
    let sx = this.swatchStartX();
    const sy = ty + (CanvasStudio.TOOL_H - CanvasStudio.SWATCH) / 2;
    for (const col of PALETTE) {
      if (
        x >= sx &&
        x <= sx + CanvasStudio.SWATCH &&
        y >= sy &&
        y <= sy + CanvasStudio.SWATCH
      ) {
        this.applyFill(col);
        return true;
      }
      sx += CanvasStudio.SWATCH + 6;
    }
    // Any other click inside the toolbar band is still "consumed" so it
    // doesn't start a marquee behind the bar.
    return x >= 170 && x <= this.swatchStartX() + PALETTE.length * 28;
  }

  private onTool(key: string): void {
    switch (key) {
      case "rect":
        this.addShape("rect");
        break;
      case "ellipse":
        this.addShape("ellipse");
        break;
      case "text":
        this.addShape("text");
        break;
      case "front":
        this.reorder(true);
        break;
      case "back":
        this.reorder(false);
        break;
      case "delete":
        this.deleteSelection();
        break;
      case "save":
        this.save();
        break;
      case "load":
        this.tryLoad(true);
        break;
    }
  }

  private addShape(type: ShapeType): void {
    const cx = this.W / 2 + (Math.random() - 0.5) * 80;
    const cy = this.H / 2 + (Math.random() - 0.5) * 80;
    let s: Shape;
    if (type === "text") {
      s = this.make("text", cx, cy, 0, 0, 0, this.currentFill, "Text");
      this.fitText(s);
    } else if (type === "ellipse") {
      s = this.make("ellipse", cx, cy, 130, 130, 0, this.currentFill);
    } else {
      s = this.make("rect", cx, cy, 170, 110, 0, this.currentFill);
    }
    this.shapes.push(s);
    this.selection = new Set([s.id]);
  }

  private applyFill(col: string): void {
    this.currentFill = col;
    for (const s of this.selShapes()) s.fill = col;
  }

  private reorder(toFront: boolean): void {
    const sel = this.selShapes();
    if (sel.length === 0) return;
    this.shapes = this.shapes.filter((s) => !this.selection.has(s.id));
    if (toFront) this.shapes.push(...sel);
    else this.shapes.unshift(...sel);
  }

  private deleteSelection(): void {
    if (this.selection.size === 0) return;
    this.shapes = this.shapes.filter((s) => !this.selection.has(s.id));
    this.selection.clear();
  }

  // --- serialization -------------------------------------------------------

  private serialize(): string {
    const dto: ShapeDTO[] = this.shapes.map((s) => ({
      type: s.type,
      cx: Math.round(s.cx * 100) / 100,
      cy: Math.round(s.cy * 100) / 100,
      w: Math.round(s.w * 100) / 100,
      h: Math.round(s.h * 100) / 100,
      rot: Math.round(s.rot * 1000) / 1000,
      fill: s.fill,
      ...(s.text !== undefined ? { text: s.text } : {}),
    }));
    return JSON.stringify({ version: 1, shapes: dto });
  }

  private save(): void {
    const json = this.serialize();
    this.savedBytes = json.length;
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* storage may be unavailable (private mode) — round-trip still works */
    }
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(json).catch(() => {});
    // eslint-disable-next-line no-console
    console.log("[Canvas Studio] scene JSON:\n" + json);
    this.showToast(
      `Saved ${this.shapes.length} objects · ${this.savedBytes} B → clipboard + console`,
    );
  }

  private tryLoad(announce: boolean): boolean {
    let json: string | null = null;
    try {
      json = localStorage.getItem(STORAGE_KEY);
    } catch {
      json = null;
    }
    if (!json) {
      if (announce) this.showToast("Nothing saved yet — press Save first");
      return false;
    }
    try {
      const parsed = JSON.parse(json) as { shapes?: ShapeDTO[] };
      if (!parsed.shapes) return false;
      this.shapes = parsed.shapes.map((d) =>
        this.make(d.type, d.cx, d.cy, d.w, d.h, d.rot, d.fill, d.text),
      );
      this.selection.clear();
      if (announce)
        this.showToast(`Loaded ${this.shapes.length} objects from JSON`);
      return true;
    } catch {
      if (announce) this.showToast("Saved JSON was invalid");
      return false;
    }
  }

  private showToast(msg: string): void {
    this.toast = { msg, t: 1 };
  }

  // --- update / animation --------------------------------------------------

  update(dt: number): void {
    const dts = Math.min(0.05, dt / 1000);
    if (this.toast.t > 0) this.toast.t = Math.max(0, this.toast.t - dts * 0.5);
  }

  // --- rendering -----------------------------------------------------------

  render(r: IRenderer): void {
    this.drawGrid(r);
    for (const s of this.shapes) this.drawShape(r, s);
    this.drawSelection(r);
    if (this.drag === "marquee") this.drawMarquee(r);
    this.drawToolbar(r);
    this.drawHint(r);
    if (this.toast.t > 0) this.drawToast(r);
  }

  private drawGrid(r: IRenderer): void {
    const step = 32;
    r.save();
    r.setGlobalAlpha(1);
    for (let gx = step; gx < this.W; gx += step) {
      r.beginPath();
      r.moveTo(gx, 0);
      r.lineTo(gx, this.H);
      r.stroke(COLOR.gridDot, 1);
    }
    for (let gy = step; gy < this.H; gy += step) {
      r.beginPath();
      r.moveTo(0, gy);
      r.lineTo(this.W, gy);
      r.stroke(COLOR.gridDot, 1);
    }
    r.restore();
  }

  private drawShape(r: IRenderer, s: Shape): void {
    r.save();
    r.translate(s.cx, s.cy);
    r.rotate(s.rot);
    if (s.type === "rect") {
      r.beginPath();
      r.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, 10);
      r.fill(s.fill);
    } else if (s.type === "ellipse") {
      r.save();
      r.scale(s.w / 2, s.h / 2);
      r.beginPath();
      r.arc(0, 0, 1, 0, TAU);
      r.fill(s.fill);
      r.restore();
    } else {
      const px = this.fontSizeOf(s);
      r.fillText(
        s.text ?? "",
        -s.w / 2 + 4,
        px * 0.34,
        `700 ${px}px Inter, system-ui`,
        s.fill,
      );
    }
    r.restore();
  }

  private drawSelection(r: IRenderer): void {
    const sel = this.selShapes();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      this.drawSingleSelection(r, sel[0]);
      return;
    }
    // Group: axis-aligned dashed-ish box (drawn as a thin solid rect; the
    // renderer has no dash support, so a lighter accent reads as "group").
    const b = this.groupBounds();
    if (!b) return;
    for (const s of sel) this.strokeOutline(r, s, COLOR.ruleBright, 1);
    r.beginPath();
    r.roundRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 2);
    r.stroke(COLOR.ink, 1.5);
  }

  private strokeOutline(
    r: IRenderer,
    s: Shape,
    color: string,
    width: number,
  ): void {
    const c = [
      this.worldPoint(s, -1, -1),
      this.worldPoint(s, 1, -1),
      this.worldPoint(s, 1, 1),
      this.worldPoint(s, -1, 1),
    ];
    r.beginPath();
    r.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) r.lineTo(c[i].x, c[i].y);
    r.closePath();
    r.stroke(color, width);
  }

  private drawSingleSelection(r: IRenderer, s: Shape): void {
    this.strokeOutline(r, s, COLOR.ink, 1.5);
    // Rotate arm + knob.
    const top = this.worldPoint(s, 0, -1);
    const rp = this.rotateHandlePoint(s);
    r.beginPath();
    r.moveTo(top.x, top.y);
    r.lineTo(rp.x, rp.y);
    r.stroke(COLOR.ink, 1.5);
    r.fillCircle(rp.x, rp.y, HANDLE + 0.5, COLOR.groundRaised);
    r.beginPath();
    r.arc(rp.x, rp.y, HANDLE + 0.5, 0, TAU);
    r.stroke(COLOR.ink, 1.5);
    // Scale handles.
    for (const [hx, hy] of CanvasStudio.HANDLE_AXES) {
      const p = this.worldPoint(s, hx, hy);
      r.beginPath();
      r.roundRect(p.x - HANDLE, p.y - HANDLE, HANDLE * 2, HANDLE * 2, 2);
      r.fill(COLOR.groundRaised);
      r.stroke(COLOR.ink, 1.5);
    }
  }

  private drawMarquee(r: IRenderer): void {
    const x = Math.min(this.marquee.x0, this.marquee.x1);
    const y = Math.min(this.marquee.y0, this.marquee.y1);
    const w = Math.abs(this.marquee.x1 - this.marquee.x0);
    const h = Math.abs(this.marquee.y1 - this.marquee.y0);
    r.save();
    r.setGlobalAlpha(0.12);
    r.beginPath();
    r.roundRect(x, y, w, h, 2);
    r.fill(COLOR.ink);
    r.restore();
    r.beginPath();
    r.roundRect(x, y, w, h, 2);
    r.stroke(COLOR.ink, 1);
  }

  private drawToolbar(r: IRenderer): void {
    const ty = CanvasStudio.TOOL_Y;
    const btns = this.toolButtons();
    const first = btns[0];
    const barX = first.x - 10;
    const swEnd =
      this.swatchStartX() + PALETTE.length * (CanvasStudio.SWATCH + 6);
    const barW = swEnd - barX + 4;
    r.save();
    r.setGlobalAlpha(0.96);
    r.beginPath();
    r.roundRect(barX, ty - 5, barW, CanvasStudio.TOOL_H + 10, 12);
    r.fill(COLOR.groundRaised);
    r.restore();
    r.beginPath();
    r.roundRect(barX, ty - 5, barW, CanvasStudio.TOOL_H + 10, 12);
    r.stroke(COLOR.rule, 1);

    const px = 13;
    const midY = ty + CanvasStudio.TOOL_H / 2;
    for (const b of btns) {
      const danger = b.key === "delete";
      r.beginPath();
      r.roundRect(b.x, ty + 4, b.w, CanvasStudio.TOOL_H - 8, 8);
      r.fill(danger ? "#fdece9" : COLOR.groundSunk);
      r.stroke(danger ? "#e9a99b" : COLOR.rule, 1);
      ctext(
        r,
        b.label,
        b.x + b.w / 2,
        midY + px * 0.34,
        px,
        danger ? "#c0442e" : COLOR.textPrimary,
        600,
      );
    }
    // Swatches.
    let sx = this.swatchStartX();
    const sy = ty + (CanvasStudio.TOOL_H - CanvasStudio.SWATCH) / 2;
    for (const col of PALETTE) {
      r.beginPath();
      r.roundRect(sx, sy, CanvasStudio.SWATCH, CanvasStudio.SWATCH, 5);
      r.fill(col);
      r.stroke(
        col === this.currentFill ? COLOR.ink : COLOR.ruleBright,
        col === this.currentFill ? 2.5 : 1,
      );
      sx += CanvasStudio.SWATCH + 6;
    }
  }

  private drawHint(r: IRenderer): void {
    const y = this.H - 30;
    ctext(
      r,
      "Drag to move · corner handles scale · top knob rotates · drag empty space to band-select · Delete removes",
      this.W / 2,
      y,
      12,
      COLOR.textFaint,
      500,
    );
  }

  private drawToast(r: IRenderer): void {
    const a = Math.min(1, this.toast.t * 1.6);
    const px = 14;
    const w = approxW(this.toast.msg, px) + 40;
    const x = this.W / 2 - w / 2;
    const y = this.H - 78;
    r.save();
    r.setGlobalAlpha(a);
    r.beginPath();
    r.roundRect(x, y, w, 34, 10);
    r.fill(COLOR.textPrimary);
    ctext(r, this.toast.msg, this.W / 2, y + 22, px, COLOR.groundRaised, 600);
    r.restore();
  }

  // --- pointer input -------------------------------------------------------

  private scenePt(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = window.innerWidth / rect.width;
    const scaleY = window.innerHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX - this.x,
      y: (clientY - rect.top) * scaleY - this.y,
    };
  }

  // The shared back chip (top-left) owns its own hit-testing through the
  // scene; skip our raw handler over its footprint so a click there doesn't
  // also clear the selection or start a marquee.
  private overChip(x: number, y: number): boolean {
    if (y > 56) return false;
    if (x < 180) return true; // back chip band
    return false;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const p = this.scenePt(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x > this.W || p.y > this.H) return;
    if (this.overChip(p.x, p.y)) return;
    if (this.hitToolbar(p.x, p.y)) return;

    this.dragStart = { x: p.x, y: p.y };

    // 1) A handle of the single selected shape?
    const h = this.hitHandle(p.x, p.y);
    if (h) {
      const s = this.selShapes()[0];
      if (h.kind === "rotate") {
        this.drag = "rotate";
      } else {
        this.drag = "resize";
        this.handleAxis = { hx: h.hx, hy: h.hy };
        this.anchor = this.worldPoint(s, -h.hx, -h.hy);
      }
      return;
    }

    // 2) A shape body?
    const hit = this.hitShape(p.x, p.y);
    if (hit) {
      const shift = e.shiftKey;
      if (shift) {
        if (this.selection.has(hit.id)) this.selection.delete(hit.id);
        else this.selection.add(hit.id);
      } else if (!this.selection.has(hit.id)) {
        this.selection = new Set([hit.id]);
      }
      this.currentFill = hit.fill;
      // Begin a move of everything currently selected.
      this.drag = "move";
      this.moveOrigins.clear();
      for (const s of this.selShapes())
        this.moveOrigins.set(s.id, { cx: s.cx, cy: s.cy });
      return;
    }

    // 3) Empty space → marquee (clear unless shift-adding).
    if (!e.shiftKey) this.selection.clear();
    this.drag = "marquee";
    this.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.scenePt(e.clientX, e.clientY);
    if (this.drag === "none") {
      this.updateCursor(p.x, p.y);
      return;
    }
    if (this.drag === "move") {
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      for (const [id, o] of this.moveOrigins) {
        const s = this.byId(id);
        if (s) {
          s.cx = o.cx + dx;
          s.cy = o.cy + dy;
        }
      }
    } else if (this.drag === "resize") {
      this.applyResize(p.x, p.y);
    } else if (this.drag === "rotate") {
      const s = this.selShapes()[0];
      if (s) {
        let ang = Math.atan2(p.y - s.cy, p.x - s.cx) + Math.PI / 2;
        if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
        s.rot = ang;
      }
    } else if (this.drag === "marquee") {
      this.marquee.x1 = p.x;
      this.marquee.y1 = p.y;
    }
  };

  private applyResize(px: number, py: number): void {
    const s = this.selShapes()[0];
    if (!s) return;
    const { hx, hy } = this.handleAxis;
    // Pointer delta from the pinned anchor, rotated into the shape's frame.
    const dx = px - this.anchor.x;
    const dy = py - this.anchor.y;
    const c = Math.cos(-s.rot);
    const sn = Math.sin(-s.rot);
    const lx = dx * c - dy * sn;
    const ly = dx * sn + dy * c;
    let newW = s.w;
    let newH = s.h;
    if (hx !== 0) newW = Math.max(MIN_SIZE, lx * hx);
    if (hy !== 0) newH = Math.max(MIN_SIZE, ly * hy);
    // Re-center so the anchor (opposite edge/corner) stays put.
    const offLx = (hx * newW) / 2;
    const offLy = (hy * newH) / 2;
    const cc = Math.cos(s.rot);
    const cs = Math.sin(s.rot);
    s.w = newW;
    s.h = newH;
    s.cx = this.anchor.x + offLx * cc - offLy * cs;
    s.cy = this.anchor.y + offLx * cs + offLy * cc;
    // Text font size derives from `h` (see fontSizeOf), so it scales for free.
  }

  private readonly onPointerUp = (): void => {
    if (this.drag === "marquee") {
      const x0 = Math.min(this.marquee.x0, this.marquee.x1);
      const y0 = Math.min(this.marquee.y0, this.marquee.y1);
      const x1 = Math.max(this.marquee.x0, this.marquee.x1);
      const y1 = Math.max(this.marquee.y0, this.marquee.y1);
      if (x1 - x0 > 3 || y1 - y0 > 3) {
        for (const s of this.shapes) {
          if (s.cx >= x0 && s.cx <= x1 && s.cy >= y0 && s.cy <= y1)
            this.selection.add(s.id);
        }
      }
    }
    this.drag = "none";
  };

  private updateCursor(x: number, y: number): void {
    let cursor = "default";
    if (this.overChip(x, y) || this.inToolbarBand(x, y)) {
      cursor = "default";
    } else if (this.hitHandle(x, y)) {
      const h = this.hitHandle(x, y);
      cursor = h?.kind === "rotate" ? "crosshair" : "nwse-resize";
    } else if (this.hitShape(x, y)) {
      cursor = "move";
    }
    if (cursor !== this.hoverCursor && this.canvas) {
      this.hoverCursor = cursor;
      this.canvas.style.cursor = cursor;
    }
  }

  private inToolbarBand(x: number, y: number): boolean {
    const ty = CanvasStudio.TOOL_Y;
    return (
      y >= ty - 5 &&
      y <= ty + CanvasStudio.TOOL_H + 5 &&
      x >= 170 &&
      x <= this.swatchStartX() + PALETTE.length * 28
    );
  }

  private readonly onDblClick = (e: MouseEvent): void => {
    const p = this.scenePt(e.clientX, e.clientY);
    const hit = this.hitShape(p.x, p.y);
    if (hit && hit.type === "text") {
      const next = window.prompt("Edit text", hit.text ?? "");
      if (next !== null) {
        hit.text = next;
        this.fitText(hit);
      }
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.selection.size === 0) return;
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    const nudge = e.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -nudge;
    else if (e.key === "ArrowRight") dx = nudge;
    else if (e.key === "ArrowUp") dy = -nudge;
    else if (e.key === "ArrowDown") dy = nudge;
    else return;
    e.preventDefault();
    for (const s of this.selShapes()) {
      s.cx += dx;
      s.cy += dy;
    }
  };
}

export default CanvasStudio;
