import { Entity, ComputeParticleEntity, type IRenderer } from '@vectojs/core';
import { Button, Stack, Text, Dropdown } from '@vectojs/ui';
import { sampleTextPoints } from './text-shape';
import { SHELL_MAX_FPS } from '../../shell-config';
import {
  BUDGET,
  resolveCountOnPathChange,
  simPathFrom,
  simPathLabel,
  type SimPath,
} from './budget';

const SHAPE_TEXT = 'VectoJS';
const FLOATS = 8; // per particle: pos.xy, vel.xy, origin.xy, size, life
const SPRING_K = 0.5;
const DAMPING = 0.85;

const UNCAPPED_LABEL = 'Uncapped';
const FPS_OPTIONS = ['30', '60', '120', '144', '240', UNCAPPED_LABEL];

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
  private pathLabel: Text;
  private simPath: SimPath;
  private countMin: number;
  private countMax: number;
  private countStep: number;
  private particleCount: number;
  /** True once the +/- stepper has been used, so a path change never overrides
   *  a count the user picked (see `resolveCountOnPathChange`). */
  private userAdjustedCount = false;
  private pendingParticleCount: number | null = null;
  private particleRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cache key + payload for `sampleTextPoints`, whose result depends only on
   *  the text and the box it is centred in. */
  private shapeCache: { key: string; pts: Float32Array } | null = null;

  constructor() {
    super('Nexus');

    // Start from the optimistic budget when the platform even reports a GPU,
    // then correct on the first frame that tells us what actually ran (see
    // `syncSimPath`). Guessing low and raising would show a sparse field for
    // one frame on the machines this demo is meant to show off.
    this.simPath = (navigator as Navigator & { gpu?: unknown }).gpu ? 'webgpu' : 'js';
    const budget = BUDGET[this.simPath];
    this.countMin = budget.min;
    this.countMax = budget.max;
    this.countStep = budget.step;
    this.particleCount = budget.initial;

    this.particles = this.buildParticles(this.particleCount);
    this.add(this.particles);

    this.reformBtn = new Button('✦ Reform', {
      font: '600 13px Inter, system-ui',
      onClick: () => this.applyShape(),
    });
    this.add(this.reformBtn);

    this.countLabel = new Text(`Particles — ${this.particleCount}`, {
      font: '600 13px Inter, system-ui',
      color: '#e2e8f0',
    });
    const STEPPER_BTN_OPTS = { font: '600 15px sans-serif', padding: 8 };
    // `Button`'s caption IS its accessible name (`getA11yAttributes` returns
    // `label: this.label`), and there is no separate option to override it — so
    // a '−' glyph would announce as "−, button". Use words.
    const minusBtn = new Button('Fewer', {
      ...STEPPER_BTN_OPTS,
      onClick: () => {
        this.userAdjustedCount = true;
        this.setParticleCount(this.particleCount - this.countStep);
      },
    });
    const plusBtn = new Button('More', {
      ...STEPPER_BTN_OPTS,
      onClick: () => {
        this.userAdjustedCount = true;
        this.setParticleCount(this.particleCount + this.countStep);
      },
    });
    const countRow = new Stack({
      direction: 'horizontal',
      gap: 10,
      align: 'center',
    });
    countRow.add(minusBtn);
    countRow.add(this.countLabel);
    countRow.add(plusBtn);

    const fpsLabel = new Text('Max FPS', {
      font: '600 13px Inter, system-ui',
      color: '#e2e8f0',
    });
    const fpsDropdown = new Dropdown(FPS_OPTIONS, {
      // Reflect the shell's real default rather than a hardcoded number: this
      // dropdown writes the shared Scene, so a label that disagreed with the
      // actual value is what let a stale `60` leak out of here and cap every
      // creation opened afterwards.
      value: SHELL_MAX_FPS === 0 ? UNCAPPED_LABEL : String(SHELL_MAX_FPS),
      label: 'Max FPS',
      width: 110,
      height: 32,
      font: '13px sans-serif',
      onChange: (v: string) => {
        if (this.scene) this.scene.maxFPS = v === UNCAPPED_LABEL ? 0 : Number(v);
      },
    });
    const fpsRow = new Stack({
      direction: 'horizontal',
      gap: 10,
      align: 'center',
    });
    fpsRow.add(fpsLabel);
    fpsRow.add(fpsDropdown);

    // Which path is simulating is the whole point of the demo, and it was
    // previously invisible — the WebGPU pass silently fell back to JS with no
    // console warning, so the page claimed a compute shader while running a
    // main-thread loop.
    this.pathLabel = new Text('Simulating — …', {
      font: '500 12px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#94a3b8',
    });

    this.controlsPanel = new Stack({
      direction: 'vertical',
      gap: 10,
      align: 'start',
    });
    this.controlsPanel.add(countRow);
    this.controlsPanel.add(fpsRow);
    this.controlsPanel.add(this.pathLabel);
    this.add(this.controlsPanel);
  }

  private buildParticles(count: number): ComputeParticleEntity {
    return new ComputeParticleEntity({
      maxParticles: count,
      size: 1.5,
      color: '#7cb3ff',
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
   *
   * The label updates immediately, but the actual GPU rebuild is debounced:
   * a burst of +/- clicks would otherwise destroy and recreate the WebGPU
   * buffers back-to-back while the previous frame's compute/render pass may
   * still be in flight on the GPU — a plausible trigger for a real-GPU
   * Firefox WebGPU crash observed during this work (MozCrashReason
   * "Queue[Id] does not exist"; see forge/findings.md 2026-07-18). Collapsing
   * a click burst into one rebuild after the user pauses removes the
   * back-to-back teardown/recreate pattern without needing engine-level
   * access to the shared GPUDevice/queue (not exposed to entities).
   */
  private setParticleCount(next: number): void {
    const count = Math.max(this.countMin, Math.min(this.countMax, next));
    if (count === this.particleCount) return;
    this.particleCount = count;
    this.countLabel.setText(`Particles — ${count}`);

    this.pendingParticleCount = count;
    if (this.particleRebuildTimer) clearTimeout(this.particleRebuildTimer);
    this.particleRebuildTimer = setTimeout(() => {
      this.particleRebuildTimer = null;
      const finalCount = this.pendingParticleCount;
      this.pendingParticleCount = null;
      if (finalCount === null || finalCount === this.particles.maxParticles) {
        return;
      }
      this.rebuildParticles(finalCount);
    }, 200);
  }

  private rebuildParticles(count: number): void {
    this.remove(this.particles);
    this.particles.destroy();
    this.particles = this.buildParticles(count);
    this.add(this.particles);
    this.alignParticleSpace();

    const g = this.getGlobalPosition();
    this.particles.initRandomParticles(this.width + g.x, this.height + g.y);
    this.applyShape();
  }

  /**
   * Cancel this entity's own offset on the particle child so that the
   * particle buffer's coordinates mean the same thing on both simulation
   * paths.
   *
   * The two paths disagree about whose space the buffer is in, and neither is
   * negotiable from here:
   *
   * - **WebGPU** draws into a stacked full-window canvas that ignores every
   *   entity transform, and the compute pass receives the raw
   *   `scene.mouseX/mouseY`. Both are window space.
   * - **CPU** is drawn inside this entity's transform
   *   (`renderer.translate(node.x, node.y)` runs before `fillCircle(x, y, …)`)
   *   and the simulation converts the mouse with `entity.worldToLocal(…)`.
   *   Both are the entity's local space.
   *
   * Seeding in window space (what this demo does, because the field must reach
   * the window's right/bottom edges) therefore drew the cloud shifted right by
   * the rail width on the CPU path *and* put the cursor's repulsion field in
   * the wrong place. Offsetting the child by `-globalPosition` makes its local
   * space identical to window space, so one set of seeds is correct for both.
   */
  private alignParticleSpace(): void {
    const g = this.getGlobalPosition();
    this.particles.setPosition(-g.x, -g.y);
  }

  /**
   * Adopt the budget for the path that actually simulated the last frame.
   *
   * `scene.accelerators` reports what ran, not merely what is installed —
   * which is the distinction that matters here, since a registered WebGPU
   * manager still yields to the CPU when the device request fails or the
   * device is later lost.
   */
  private syncSimPath(): void {
    const scene = this.scene;
    if (!scene) return;
    const path = simPathFrom(scene.accelerators.particle.path);
    const label = `Simulating — ${simPathLabel(path)}`;
    if (this.pathLabel.text !== label) this.pathLabel.setText(label);
    if (path === this.simPath) return;

    this.simPath = path;
    const budget = BUDGET[path];
    this.countMin = budget.min;
    this.countMax = budget.max;
    this.countStep = budget.step;
    const count = resolveCountOnPathChange(this.particleCount, path, this.userAdjustedCount);
    if (count !== this.particleCount) this.setParticleCount(count);
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.reformBtn.setPosition(width - this.reformBtn.width - 16, 16);
    this.controlsPanel.setPosition(
      width - Math.max(this.controlsPanel.width, 200) - 16,
      16 + this.reformBtn.height + 12,
    );
    // Particle coordinates are consumed in WINDOW space (see
    // `alignParticleSpace` for why, and for how the CPU path is made to agree).
    // Size the sim bounds to local size + world offset so the field reaches the
    // window's right/bottom edges, and offset every seed by the world position.
    this.alignParticleSpace();
    const g = this.getGlobalPosition();
    this.particles.initRandomParticles(width + g.x, height + g.y);
    this.applyShape();
  }

  override destroy(): void {
    if (this.particleRebuildTimer) {
      clearTimeout(this.particleRebuildTimer);
      this.particleRebuildTimer = null;
    }
    // ComputeParticleEntity owns real GPU resources — see the same
    // reasoning in the Knowledge Graph port.
    this.particles.destroy();
    // The FPS dropdown mutates the Gallery's one shared Scene while Nexus is
    // open (see the onChange handler above). Restoring the shell default is
    // deliberately NOT done here: this class cannot know it, and when it tried,
    // it wrote a literal that disagreed with the shell and left every later
    // creation capped. `teardownCurrent` in main.ts owns the restore.
    super.destroy();
  }

  override isPointInside(): boolean {
    return false;
  }

  override update(): void {
    // ComputeParticleEntity drives its own simulation; the only thing to do
    // here is notice which path took the last frame.
    this.syncSimPath();
  }

  override render(_r: IRenderer): void {
    /* the particle field and button are drawn by their own child entities */
  }

  /**
   * Seeds both the spring origin AND the current position onto the sampled
   * text pixels (with a little jitter) so the word forms instantly rather
   * than waiting several seconds for the spring to pull a scatter into
   * place — same reasoning as the original page.
   *
   * The sample set is cached on `(text, width, height)`. `sampleTextPoints`
   * allocates a full-workspace canvas, rasterizes the word, and runs
   * `getImageData` over the whole box before scanning every 4th pixel — at a
   * 1120×900 workspace that is a ~1MP readback, and it ran on every Reform
   * click even though nothing it depends on had changed.
   */
  private applyShape(): void {
    const key = `${SHAPE_TEXT}|${this.width}|${this.height}`;
    let pts = this.shapeCache?.key === key ? this.shapeCache.pts : null;
    if (!pts) {
      pts = sampleTextPoints(SHAPE_TEXT, this.width, this.height);
      this.shapeCache = { key, pts };
    }
    if (pts.length < 2) return;
    const n = pts.length / 2;
    const d = this.particles.particleData;
    // Seeds are local-space samples; shift them into window space (see
    // alignParticleSpace) so the word centres in the workspace instead of
    // straddling the rail.
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
