import { Entity, ComputeParticleEntity, type IRenderer } from "@vectojs/core";
import { Button, Stack, Text, Dropdown } from "@vectojs/ui";
import { sampleTextPoints } from "./text-shape";

const SHAPE_TEXT = "VectoJS";
const FLOATS = 8; // per particle: pos.xy, vel.xy, origin.xy, size, life
const SPRING_K = 0.5;
const DAMPING = 0.85;

const GALLERY_DEFAULT_MAX_FPS = 60; // matches main.ts's shared Scene({ maxFPS: 60 })
const FPS_OPTIONS = ["30", "60", "120", "Uncapped"];

/**
 * The particle field itself: a single `ComputeParticleEntity` seeded onto
 * the word "VectoJS", a "Reform" button that re-seeds it (handy after the
 * cursor has scattered the cloud), and a small controls panel (particle
 * count + max FPS) so the performance/density tradeoff is visible and
 * adjustable rather than a fixed constant. Zoom/pan/click-to-explode from
 * the original page are still dropped — that interaction CSS-transformed
 * the *entire* canvas, which would drag the Gallery's shared rail/bed
 * along with it here.
 */
class Nexus extends Entity {
  private particles: ComputeParticleEntity;
  private reformBtn: Button;
  private controlsPanel: Stack;
  private countLabel: Text;
  private readonly hasGPU: boolean;
  private readonly countMin: number;
  private readonly countMax: number;
  private readonly countStep: number;
  private particleCount: number;

  constructor() {
    super("Nexus");

    this.hasGPU = !!(navigator as Navigator & { gpu?: unknown }).gpu;
    this.countMin = this.hasGPU ? 5000 : 500;
    this.countMax = this.hasGPU ? 120000 : 6000;
    this.countStep = this.hasGPU ? 5000 : 500;
    this.particleCount = this.hasGPU ? 60000 : 4000;

    this.particles = this.buildParticles(this.particleCount);
    this.add(this.particles);

    this.reformBtn = new Button("✦ Reform", {
      font: "600 13px Inter, system-ui",
      onClick: () => this.applyShape(),
    });
    this.add(this.reformBtn);

    this.countLabel = new Text(`Particles — ${this.particleCount}`, {
      font: "600 13px Inter, system-ui",
      color: "#e2e8f0",
    });
    const STEPPER_BTN_OPTS = { font: "600 15px sans-serif", padding: 8 };
    const minusBtn = new Button("−", {
      ...STEPPER_BTN_OPTS,
      onClick: () => this.setParticleCount(this.particleCount - this.countStep),
    });
    const plusBtn = new Button("+", {
      ...STEPPER_BTN_OPTS,
      onClick: () => this.setParticleCount(this.particleCount + this.countStep),
    });
    const countRow = new Stack({
      direction: "horizontal",
      gap: 10,
      align: "center",
    });
    countRow.add(minusBtn);
    countRow.add(this.countLabel);
    countRow.add(plusBtn);

    const fpsLabel = new Text("Max FPS", {
      font: "600 13px Inter, system-ui",
      color: "#e2e8f0",
    });
    const fpsDropdown = new Dropdown(FPS_OPTIONS, {
      value: String(GALLERY_DEFAULT_MAX_FPS),
      width: 110,
      height: 32,
      font: "13px sans-serif",
      onChange: (v: string) => {
        if (this.scene) this.scene.maxFPS = v === "Uncapped" ? 0 : Number(v);
      },
    });
    const fpsRow = new Stack({
      direction: "horizontal",
      gap: 10,
      align: "center",
    });
    fpsRow.add(fpsLabel);
    fpsRow.add(fpsDropdown);

    this.controlsPanel = new Stack({
      direction: "vertical",
      gap: 10,
      align: "start",
    });
    this.controlsPanel.add(countRow);
    this.controlsPanel.add(fpsRow);
    this.add(this.controlsPanel);
  }

  private buildParticles(count: number): ComputeParticleEntity {
    return new ComputeParticleEntity({
      maxParticles: count,
      size: 1.5,
      color: "#7cb3ff",
      springK: SPRING_K,
      damping: DAMPING,
      bounceDamping: 0.6,
      maxVelocity: 180,
    });
  }

  /**
   * `ComputeParticleEntity` has no public resize path — its `particleData`
   * buffer (and, on WebGPU, its GPU storage buffer) is sized once from the
   * constructor's `maxParticles`. Changing the count destroys the old
   * entity and swaps in a freshly built one, then reseeds it exactly like
   * `resizeTo`/`applyShape` already do for a plain reform.
   */
  private setParticleCount(next: number): void {
    const count = Math.max(this.countMin, Math.min(this.countMax, next));
    if (count === this.particleCount) return;
    this.particleCount = count;
    this.countLabel.setText(`Particles — ${count}`);

    this.remove(this.particles);
    this.particles.destroy();
    this.particles = this.buildParticles(count);
    this.add(this.particles);

    const g = this.getGlobalPosition();
    this.particles.initRandomParticles(this.width + g.x, this.height + g.y);
    this.applyShape();
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.reformBtn.setPosition(width - this.reformBtn.width - 16, 16);
    this.controlsPanel.setPosition(
      width - Math.max(this.controlsPanel.width, 200) - 16,
      16 + this.reformBtn.height + 12,
    );
    // Particle coordinates are consumed in WINDOW space, not this entity's
    // local space (the GPU layer is a stacked full-window canvas that ignores
    // the parent transform — forge/findings.md 2026-07-17). Size the sim
    // bounds to local size + world offset so the field reaches the window's
    // right/bottom edges, and offset every seed by the world position below.
    const g = this.getGlobalPosition();
    this.particles.initRandomParticles(width + g.x, height + g.y);
    this.applyShape();
  }

  override destroy(): void {
    // ComputeParticleEntity owns real GPU resources — see the same
    // reasoning in the Knowledge Graph port.
    this.particles.destroy();
    // The FPS dropdown mutates the Gallery's one shared Scene while Nexus
    // is open (see the onChange handler above) — restore the shell default
    // on the way out so leaving this creation doesn't leave every other
    // creation permanently capped/uncapped.
    if (this.scene) this.scene.maxFPS = GALLERY_DEFAULT_MAX_FPS;
    super.destroy();
  }

  override isPointInside(): boolean {
    return false;
  }

  override update(): void {
    /* ComputeParticleEntity drives its own simulation; nothing extra to do here */
  }

  override render(_r: IRenderer): void {
    /* the particle field and button are drawn by their own child entities */
  }

  /**
   * Seeds both the spring origin AND the current position onto the sampled
   * text pixels (with a little jitter) so the word forms instantly rather
   * than waiting several seconds for the spring to pull a scatter into
   * place — same reasoning as the original page.
   */
  private applyShape(): void {
    const pts = sampleTextPoints(SHAPE_TEXT, this.width, this.height);
    if (pts.length < 2) return;
    const n = pts.length / 2;
    const d = this.particles.particleData;
    // Seeds are local-space samples; shift them into window space (see
    // resizeTo) so the word centres in the workspace instead of straddling
    // the rail.
    const g = this.getGlobalPosition();
    for (let i = 0; i < this.particles.maxParticles; i++) {
      const p = (i % n) * 2;
      const ox = pts[p] + g.x;
      const oy = pts[p + 1] + g.y;
      d[i * FLOATS] = ox + (Math.random() - 0.5) * 3;
      d[i * FLOATS + 1] = oy + (Math.random() - 0.5) * 3;
      d[i * FLOATS + 2] = 0;
      d[i * FLOATS + 3] = 0;
      d[i * FLOATS + 4] = ox;
      d[i * FLOATS + 5] = oy;
    }
    this.particles.needsInit = true;
  }
}

export default Nexus;
