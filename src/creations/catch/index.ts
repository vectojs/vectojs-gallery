import { Entity } from "@vectojs/core";
import type { IRenderer } from "@vectojs/core";

type FruitKey = "apple" | "grape" | "orange" | "lime";
interface FruitDef {
  key: FruitKey;
  name: string;
  color: string;
}
const FRUITS: FruitDef[] = [
  { key: "apple", name: "Apples", color: "#e23b3b" },
  { key: "grape", name: "Grapes", color: "#8b5cf6" },
  { key: "orange", name: "Oranges", color: "#f59e0b" },
  { key: "lime", name: "Limes", color: "#22c55e" },
];
const defOf = (k: FruitKey): FruitDef =>
  FRUITS.find((f) => f.key === k) as FruitDef;

interface Fruit {
  x: number;
  y: number;
  r: number;
  key: FruitKey;
}

const CATCH_BUDGET = 5;
const SPAWN_INTERVAL = 0.85; // seconds between drops
const TAU = Math.PI * 2;

// Approximate centered text — the renderer draws left-aligned and has no measureText.
function ctext(
  r: IRenderer,
  text: string,
  cx: number,
  y: number,
  font: string,
  px: number,
  color: string,
): void {
  r.fillText(text, cx - text.length * px * 0.27, y, font, color);
}

// A single fruit: colored body, a gloss highlight, a stem, and a leaf. Grapes are
// drawn as a little cluster so they read differently from the round fruit.
function drawFruit(
  r: IRenderer,
  x: number,
  y: number,
  rad: number,
  key: FruitKey,
): void {
  const def = defOf(key);
  const stemW = Math.max(2, rad * 0.13);
  if (key === "grape") {
    r.beginPath();
    r.moveTo(x, y - rad * 0.7);
    r.lineTo(x + rad * 0.1, y - rad * 1.15);
    r.stroke("#7c4a1e", stemW);
    r.fillCircle(x + rad * 0.32, y - rad * 1.05, rad * 0.24, "#4ade80");
    const s = rad * 0.44;
    const off: [number, number][] = [
      [-0.55, -0.35],
      [0.55, -0.35],
      [0, -0.72],
      [-0.6, 0.4],
      [0.6, 0.4],
      [0, 0.55],
      [0, 0.02],
    ];
    for (const [ox, oy] of off)
      r.fillCircle(x + ox * rad, y + oy * rad, s, def.color);
    r.fillCircle(x - rad * 0.28, y - rad * 0.18, rad * 0.16, "#ffffff", 0.28);
    return;
  }
  r.beginPath();
  r.moveTo(x, y - rad + 1);
  r.lineTo(x + rad * 0.14, y - rad - rad * 0.42);
  r.stroke("#7c4a1e", stemW);
  r.fillCircle(x + rad * 0.42, y - rad * 0.92, rad * 0.24, "#4ade80");
  r.fillCircle(x, y, rad, def.color);
  r.fillCircle(x - rad * 0.3, y - rad * 0.34, rad * 0.26, "#ffffff", 0.32);
}

type Phase = "ready" | "play" | "win" | "fail";

class CatchGame extends Entity {
  W = 0;
  H = 0;
  private fruits: Fruit[] = [];
  plateX = 0;
  keyDir = 0; // -1 left, +1 right, 0 none
  private goalKey: FruitKey = "apple";
  private goalNeed = 3;
  private goalGot = 0;
  private catchesLeft = CATCH_BUDGET;
  phase: Phase = "ready";
  overlayT = 0;
  private spawnAcc = 0;
  private flash = 0;
  private flashOk = true;
  private t = 0; // free-running clock for idle animation (the Start-button pulse)

  private get fruitR(): number {
    return Math.max(15, Math.min(30, this.H * 0.05));
  }
  private get plateW(): number {
    return Math.max(84, Math.min(180, this.W * 0.15));
  }
  private get plateH(): number {
    return 15;
  }
  private get plateTop(): number {
    return this.H - 46;
  }
  private get fallSpeed(): number {
    return Math.max(150, this.H * 0.4);
  }
  private get plateSpeed(): number {
    return this.W * 0.95;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: this.W, height: this.H };
  }

  // The game reads pointer + keyboard input directly, so it opts out of the
  // engine's hit-testing entirely.
  isPointInside(): boolean {
    return false;
  }

  setSize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    const half = this.plateW / 2;
    this.plateX = Math.min(w - half, Math.max(half, this.plateX || w / 2));
  }

  reset(): void {
    this.goalKey = FRUITS[(Math.random() * FRUITS.length) | 0].key;
    this.goalNeed = 2 + ((Math.random() * 3) | 0); // 2..4
    this.goalGot = 0;
    this.catchesLeft = CATCH_BUDGET;
    this.fruits = [];
    this.spawnAcc = 0;
    this.phase = "ready";
    this.overlayT = 0;
    this.flash = 0;
    this.plateX = this.W / 2;
  }

  begin(): void {
    if (this.phase === "ready") this.phase = "play";
  }

  // Centered Start button (canvas-drawn, so the game stays zero-DOM). One geometry
  // shared by the renderer and the hit-test.
  private startRect(): { x: number; y: number; w: number; h: number } {
    const w = Math.max(150, Math.min(240, this.W * 0.24));
    const h = Math.max(44, Math.min(64, this.H * 0.1));
    return { x: this.W / 2 - w / 2, y: this.H * 0.66 - h / 2, w, h };
  }

  hitStart(x: number, y: number): boolean {
    if (this.phase !== "ready") return false;
    const b = this.startRect();
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  setPlate(x: number): void {
    if (this.phase !== "play") return;
    const half = this.plateW / 2;
    this.plateX = Math.min(this.W - half, Math.max(half, x));
  }

  private spawn(): void {
    const r = this.fruitR;
    // Bias toward the target so the round doesn't drag, but keep most fruit "wrong"
    // so catching still takes deliberate positioning.
    let key: FruitKey;
    if (Math.random() < 0.4) {
      key = this.goalKey;
    } else {
      const others = FRUITS.filter((f) => f.key !== this.goalKey);
      key = others[(Math.random() * others.length) | 0].key;
    }
    this.fruits.push({
      x: r + Math.random() * (this.W - 2 * r),
      y: -r,
      r,
      key,
    });
  }

  update(dt: number): void {
    const dts = Math.min(0.05, dt / 1000); // clamp so a tab-resume can't teleport fruit
    this.t += dts;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dts * 3);
    if (this.phase === "ready") return; // fruit only falls after Start is pressed
    if (this.phase !== "play") {
      this.overlayT = Math.min(1, this.overlayT + dts * 3);
      return;
    }

    if (this.keyDir !== 0)
      this.setPlate(this.plateX + this.keyDir * this.plateSpeed * dts);

    this.spawnAcc += dts;
    while (this.spawnAcc >= SPAWN_INTERVAL) {
      this.spawnAcc -= SPAWN_INTERVAL;
      this.spawn();
    }

    const top = this.plateTop;
    const halfW = this.plateW / 2;
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      f.y += this.fallSpeed * dts;
      const caught =
        f.y + f.r >= top &&
        f.y - f.r <= top + this.plateH &&
        Math.abs(f.x - this.plateX) <= halfW + f.r * 0.4;
      if (caught) {
        this.fruits.splice(i, 1);
        this.catchesLeft--;
        const isTarget = f.key === this.goalKey;
        if (isTarget) this.goalGot++;
        this.flash = 1;
        this.flashOk = isTarget;
        if (this.goalGot >= this.goalNeed) {
          this.phase = "win";
          this.overlayT = 0;
        } else if (this.catchesLeft <= 0) {
          this.phase = "fail";
          this.overlayT = 0;
        }
      } else if (f.y - f.r > this.H) {
        this.fruits.splice(i, 1); // missed — no penalty
      }
    }
  }

  render(r: IRenderer): void {
    if (this.phase === "ready") {
      this.drawPlate(r);
      this.drawReady(r);
      return;
    }
    for (const f of this.fruits) drawFruit(r, f.x, f.y, f.r, f.key);
    this.drawPlate(r);
    this.drawHUD(r);
    if (this.phase !== "play") this.drawOverlay(r);
  }

  private drawReady(r: IRenderer): void {
    const W = this.W;
    const H = this.H;
    const def = defOf(this.goalKey);
    const bigR = Math.max(22, H * 0.07);
    ctext(
      r,
      "Fruit Catch",
      W / 2,
      H * 0.24,
      "800 30px Inter, system-ui",
      30,
      "#f8fafc",
    );
    drawFruit(r, W / 2, H * 0.42, bigR, this.goalKey);
    ctext(
      r,
      `Catch ${this.goalNeed} ${def.name}`,
      W / 2,
      H * 0.42 + bigR + 36,
      "700 20px Inter, system-ui",
      20,
      "#e2e8f0",
    );
    ctext(
      r,
      "You have 5 catches — a wrong fruit wastes one",
      W / 2,
      H * 0.42 + bigR + 60,
      "400 13px Inter, system-ui",
      13,
      "#94a3b8",
    );

    // Pulsing Start button
    const b = this.startRect();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.2);
    r.beginPath();
    r.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    r.fill("#22c55e");
    r.stroke(`rgba(134,239,172,${(0.35 + pulse * 0.5).toFixed(3)})`, 2);
    const cyb = b.y + b.h / 2;
    const cxb = b.x + b.w / 2;
    r.beginPath();
    r.moveTo(cxb - 34, cyb - 8);
    r.lineTo(cxb - 34, cyb + 8);
    r.lineTo(cxb - 21, cyb);
    r.closePath();
    r.fill("#052e16");
    ctext(
      r,
      "Start",
      cxb + 8,
      cyb + 6,
      "800 18px Inter, system-ui",
      18,
      "#052e16",
    );

    ctext(
      r,
      "Move with the mouse or the arrow keys",
      W / 2,
      b.y + b.h + 30,
      "500 12px Inter, system-ui",
      12,
      "#7c8aa5",
    );
  }

  private drawPlate(r: IRenderer): void {
    const w = this.plateW;
    const h = this.plateH;
    const x = this.plateX - w / 2;
    const y = this.plateTop;
    if (this.flash > 0) {
      // catch feedback: a soft ring pulse under the plate
      r.fillCircle(
        this.plateX,
        y + h / 2,
        w * 0.62 * (1 - this.flash * 0.4),
        this.flashOk ? "#22c55e" : "#ef4444",
        this.flash * 0.22,
      );
    }
    r.beginPath();
    r.roundRect(x, y, w, h, h / 2);
    r.fill("#e2e8f0");
    r.stroke("#94a3b8", 1.5);
    r.beginPath();
    r.roundRect(x + 5, y + 2.5, w - 10, h * 0.42, h * 0.2);
    r.fill("#ffffff");
  }

  private drawHUD(r: IRenderer): void {
    const W = this.W;
    r.beginPath();
    r.roundRect(8, 10, W - 16, 46, 12);
    r.fill("rgba(8,12,22,0.55)"); // translucent dark bar (no gradients needed)
    r.stroke("rgba(255,255,255,0.08)", 1);

    // Goal (left): mini target fruit + "Catch N" / name
    const def = defOf(this.goalKey);
    drawFruit(r, 34, 34, 12, this.goalKey);
    r.fillText(
      `Catch ${this.goalNeed}`,
      54,
      30,
      "700 15px Inter, system-ui",
      "#f1f5f9",
    );
    r.fillText(def.name, 54, 47, "500 12px Inter, system-ui", "#94a3b8");

    // Progress (centre): one dot per required target, filled as caught
    const startX = W / 2 - (this.goalNeed - 1) * 13;
    for (let i = 0; i < this.goalNeed; i++) {
      const px = startX + i * 26;
      if (i < this.goalGot) drawFruit(r, px, 33, 9, this.goalKey);
      else r.fillCircle(px, 33, 9, "#ffffff", 0.12);
    }

    // Catches left (right): five pips depleting
    const pipW = 12;
    const pipGap = 6;
    const total = CATCH_BUDGET * pipW + (CATCH_BUDGET - 1) * pipGap;
    const px0 = W - 18 - total;
    r.fillText("catches", px0, 26, "500 10px Inter, system-ui", "#94a3b8");
    for (let i = 0; i < CATCH_BUDGET; i++) {
      const px = px0 + i * (pipW + pipGap);
      r.beginPath();
      r.roundRect(px, 34, pipW, pipW, 3);
      r.fill(i < this.catchesLeft ? "#38bdf8" : "rgba(255,255,255,0.1)");
    }
  }

  private drawOverlay(r: IRenderer): void {
    const W = this.W;
    const H = this.H;
    const a = this.overlayT;
    const win = this.phase === "win";
    r.save();
    r.setGlobalAlpha(0.74 * a);
    r.beginPath();
    r.roundRect(0, 0, W, H, 0);
    r.fill(win ? "#04140a" : "#160406");
    r.restore();

    r.save();
    r.setGlobalAlpha(a);
    const cx = W / 2;
    const cy = H * 0.4;
    const col = win ? "#22c55e" : "#ef4444";
    r.fillCircle(cx, cy, 34, col, 0.16);
    r.beginPath();
    r.arc(cx, cy, 34, 0, TAU);
    r.stroke(col, 3);
    if (win) {
      r.beginPath();
      r.moveTo(cx - 15, cy + 1);
      r.lineTo(cx - 5, cy + 12);
      r.lineTo(cx + 16, cy - 13);
      r.stroke(col, 4.5);
    } else {
      r.beginPath();
      r.moveTo(cx - 12, cy - 12);
      r.lineTo(cx + 12, cy + 12);
      r.moveTo(cx + 12, cy - 12);
      r.lineTo(cx - 12, cy + 12);
      r.stroke(col, 4.5);
    }
    ctext(
      r,
      win ? "Human verified" : "Out of catches",
      cx,
      cy + 72,
      "800 26px Inter, system-ui",
      26,
      "#f8fafc",
    );
    ctext(
      r,
      `Caught ${this.goalGot} / ${this.goalNeed} ${defOf(this.goalKey).name}`,
      cx,
      cy + 100,
      "500 14px Inter, system-ui",
      14,
      "#94a3b8",
    );
    ctext(
      r,
      "Press any key or click to play again",
      cx,
      cy + 132,
      "600 13px Inter, system-ui",
      13,
      "#7dd3fc",
    );
    r.restore();
  }

  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    super("CatchGame");
    this.canvas = document.getElementById(
      "gallery-canvas",
    ) as HTMLCanvasElement | null;
    if (this.canvas) {
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
    }
    this.reset();
  }

  /** Adapts CatchGame's own `W`/`H`-based sizing to main.ts's generic resize path. */
  resizeTo(width: number, height: number): void {
    this.setSize(width, height);
  }

  override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    super.destroy();
  }

  /**
   * Converts a client-space pointer event into this entity's own local
   * coordinate space. The Gallery's canvas spans the full window (rail +
   * bed), so unlike the old standalone demo (whose private canvas exactly
   * matched the game's own W/H), this has to both scale for any CSS/canvas
   * size mismatch *and* subtract this entity's own screen-space offset
   * (`this.x`/`this.y`, set by main.ts's `setPosition(RAIL_WIDTH, 0)`).
   */
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

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.scenePt(e.clientX, e.clientY);
    this.setPlate(p.x);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    const p = this.scenePt(e.clientX, e.clientY);
    if (this.phase === "ready") {
      if (this.hitStart(p.x, p.y)) this.begin();
    } else if (this.phase === "play") {
      this.setPlate(p.x);
    } else {
      this.reset();
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.phase === "ready") {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        this.begin();
      }
      return;
    }
    if (this.phase !== "play") {
      if (e.key === " " || e.key === "Enter" || e.key.startsWith("Arrow")) {
        e.preventDefault();
        this.reset();
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.keyDir = -1;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this.keyDir = 1;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "ArrowLeft" && this.keyDir === -1) this.keyDir = 0;
    if (e.key === "ArrowRight" && this.keyDir === 1) this.keyDir = 0;
  };
}

export default CatchGame;
