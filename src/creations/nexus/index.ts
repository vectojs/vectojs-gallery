import { Entity, ComputeParticleEntity, type IRenderer } from "@vectojs/core";
import { Button } from "@vectojs/ui";
import { sampleTextPoints } from "./text-shape";

const SHAPE_TEXT = "VectoJS";
const FLOATS = 8; // per particle: pos.xy, vel.xy, origin.xy, size, life
const SPRING_K = 0.5;
const DAMPING = 0.85;

/**
 * The particle field itself: a single `ComputeParticleEntity` seeded onto
 * the word "VectoJS", plus one "Reform" button that re-seeds it (handy
 * after the cursor has scattered the cloud). Zoom/pan/click-to-explode
 * and the settings panel from the original page are dropped — that
 * interaction CSS-transformed the *entire* canvas, which in the old
 * per-demo page was fine (nexus owned that canvas outright) but would
 * drag the Gallery's shared rail/bed along with it here, and neither
 * is part of the demo's stated headline ("springing into the word
 * 'VectoJS', flowing away from your cursor").
 */
class Nexus extends Entity {
  private particles: ComputeParticleEntity;
  private reformBtn: Button;

  constructor() {
    super("Nexus");

    const hasGPU = !!(navigator as Navigator & { gpu?: unknown }).gpu;
    const count = hasGPU ? 60000 : 4000;

    this.particles = new ComputeParticleEntity({
      maxParticles: count,
      size: 1.5,
      color: "#7cb3ff",
      springK: SPRING_K,
      damping: DAMPING,
      bounceDamping: 0.6,
      maxVelocity: 180,
    });
    this.add(this.particles);

    this.reformBtn = new Button("✦ Reform", {
      font: "600 13px Inter, system-ui",
      onClick: () => this.applyShape(),
    });
    this.add(this.reformBtn);
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.reformBtn.setPosition(width - this.reformBtn.width - 16, 16);
    this.particles.initRandomParticles(width, height);
    this.applyShape();
  }

  override destroy(): void {
    // ComputeParticleEntity owns real GPU resources — see the same
    // reasoning in the Knowledge Graph port.
    this.particles.destroy();
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
    for (let i = 0; i < this.particles.maxParticles; i++) {
      const p = (i % n) * 2;
      d[i * FLOATS] = pts[p] + (Math.random() - 0.5) * 3;
      d[i * FLOATS + 1] = pts[p + 1] + (Math.random() - 0.5) * 3;
      d[i * FLOATS + 2] = 0;
      d[i * FLOATS + 3] = 0;
      d[i * FLOATS + 4] = pts[p];
      d[i * FLOATS + 5] = pts[p + 1];
    }
    this.particles.needsInit = true;
  }
}

export default Nexus;
