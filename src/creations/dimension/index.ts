import { Entity } from "@vectojs/core";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ThreeAdapter } from "@vectojs/three";
import { Stack, Text, Toggle, Button } from "@vectojs/ui";
import { buildParticlePositions } from "./particle-field";

interface SceneState {
  particleCount: number;
  autoOrbit: boolean;
  grid: boolean;
  spin: boolean;
}

const PARTICLE_RADIUS = 9;
const PANEL_W = 512;
const PANEL_H = 400;
const PANEL_SCALE = 4.2;
const COUNT_STEP = 200;
const COUNT_MIN = 100;
const COUNT_MAX = 2000;

/**
 * A `@vectojs/ui` control panel floating in a Three.js scene via
 * `ThreeAdapter`, raycast-interactive. Owns a secondary `<canvas>`
 * (created here — the Gallery's `index.html` only has the one shared
 * canvas) rather than drawing through `IRenderer`; `render()` is a
 * no-op. This demo's Three.js content can't live inside the Gallery's
 * shared 2D `Scene` the way the other ported demos do.
 */
class Dimension extends Entity {
  private canvas: HTMLCanvasElement | null = null;
  private fallbackEl: HTMLDivElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private threeScene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private adapter: ThreeAdapter | null = null;
  private particles: THREE.Points | null = null;
  private grid: THREE.GridHelper | null = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private state: SceneState = {
    particleCount: 600,
    autoOrbit: false,
    grid: true,
    spin: false,
  };
  private raf = 0;
  private last = 0;

  constructor() {
    super("Dimension");

    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.zIndex = "5";
    document.body.appendChild(this.canvas);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
      });
    } catch {
      this.showFallback();
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color("#04060d");

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, 6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 14;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.82;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.target.set(0, 0.6, 0);

    const particleMaterial = new THREE.PointsMaterial({
      color: "#5b9cff",
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.particles = new THREE.Points(
      new THREE.BufferGeometry(),
      particleMaterial,
    );
    this.rebuildParticles(this.state.particleCount);
    this.threeScene.add(this.particles);

    this.grid = new THREE.GridHelper(24, 24, 0x2b3a63, 0x16233f);
    this.grid.position.y = -1.4;
    this.threeScene.add(this.grid);

    this.adapter = new ThreeAdapter({ width: PANEL_W, height: PANEL_H });
    (this.adapter.mesh.material as THREE.MeshBasicMaterial).side =
      THREE.DoubleSide;
    this.adapter.mesh.scale.set(
      PANEL_SCALE,
      PANEL_SCALE * (PANEL_H / PANEL_W),
      1,
    );
    this.adapter.mesh.position.set(0, 0.6, 0);
    this.threeScene.add(this.adapter.mesh);
    this.buildPanel(this.adapter);

    this.canvas.addEventListener("pointermove", this.onCanvasPointerMove);
    this.canvas.addEventListener("click", this.onCanvasClick);
    this.canvas.addEventListener("wheel", this.onCanvasWheel, {
      passive: true,
    });
    window.addEventListener("pointerdown", this.onWindowPointerDown, {
      capture: true,
    });
    window.addEventListener("pointerup", this.onWindowPointerUp);

    this.startLoop();
  }

  private showFallback(): void {
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.fallbackEl = document.createElement("div");
    this.fallbackEl.textContent = "WebGL isn't available in this browser.";
    this.fallbackEl.style.position = "fixed";
    this.fallbackEl.style.top = "0";
    this.fallbackEl.style.left = "0";
    this.fallbackEl.style.display = "flex";
    this.fallbackEl.style.alignItems = "center";
    this.fallbackEl.style.justifyContent = "center";
    this.fallbackEl.style.color = "#9fb0cc";
    this.fallbackEl.style.font = "16px Inter, system-ui";
    document.body.appendChild(this.fallbackEl);
  }

  private rebuildParticles(count: number): void {
    if (!this.particles) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        buildParticlePositions(count, PARTICLE_RADIUS),
        3,
      ),
    );
    this.particles.geometry.dispose();
    this.particles.geometry = geo;
  }

  private buildPanel(adapter: ThreeAdapter): void {
    const countLabel = new Text(`Particles — ${this.state.particleCount}`, {
      font: "400 22px Inter, system-ui",
      color: "#9fb0cc",
    });
    const setCount = (next: number): void => {
      this.state.particleCount = Math.max(COUNT_MIN, Math.min(COUNT_MAX, next));
      countLabel.setText(`Particles — ${this.state.particleCount}`);
      this.rebuildParticles(this.state.particleCount);
    };
    const STEPPER_BTN_OPTS = { font: "600 22px sans-serif", padding: 20 };
    const minusBtn = new Button("−", {
      ...STEPPER_BTN_OPTS,
      onClick: () => setCount(this.state.particleCount - COUNT_STEP),
    });
    const plusBtn = new Button("+", {
      ...STEPPER_BTN_OPTS,
      onClick: () => setCount(this.state.particleCount + COUNT_STEP),
    });
    const stepperRow = new Stack({
      direction: "horizontal",
      gap: 14,
      align: "center",
    });
    stepperRow.add(minusBtn);
    stepperRow.add(countLabel);
    stepperRow.add(plusBtn);

    const heading = new Text("Scene Controls", {
      font: "600 30px Inter, system-ui",
      color: "#f8fafc",
    });

    const TOGGLE_OPTS = { width: 72, height: 40, font: "18px sans-serif" };
    const orbitToggle = new Toggle({
      ...TOGGLE_OPTS,
      label: "Auto-orbit",
      checked: this.state.autoOrbit,
      onChange: (v: boolean) => {
        this.state.autoOrbit = v;
      },
    });
    const gridToggle = new Toggle({
      ...TOGGLE_OPTS,
      label: "Floor grid",
      checked: this.state.grid,
      onChange: (v: boolean) => {
        this.state.grid = v;
      },
    });
    const spinToggle = new Toggle({
      ...TOGGLE_OPTS,
      label: "Panel spin",
      checked: this.state.spin,
      onChange: (v: boolean) => {
        this.state.spin = v;
      },
    });

    const panel = new Stack({ direction: "vertical", gap: 32, align: "start" });
    panel.add(heading);
    panel.add(stepperRow);
    panel.add(orbitToggle);
    panel.add(gridToggle);
    panel.add(spinToggle);
    panel.setPosition(40, 36);
    adapter.vectoScene.add(panel);
  }

  private setNdc(e: MouseEvent | WheelEvent): void {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  private forward(
    type: "pointerdown" | "pointerup" | "pointermove" | "wheel" | "click",
    e: MouseEvent | WheelEvent,
  ): boolean {
    if (!this.adapter || !this.camera) return false;
    this.setNdc(e);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.adapter.updateIntersection(this.raycaster, type, e);
  }

  // Capture-phase on window, not a bubble listener on the canvas — OrbitControls
  // registers its own pointerdown listener directly on the canvas in its
  // constructor, and a capture-phase ancestor listener always runs before any
  // target-phase listener on the canvas regardless of registration order. See
  // the original vectojs-website/src/demos/dimension.ts for the full reasoning.
  private readonly onWindowPointerDown = (e: PointerEvent): void => {
    if (this.forward("pointerdown", e) && this.controls)
      this.controls.enabled = false;
  };

  private readonly onWindowPointerUp = (e: PointerEvent): void => {
    this.forward("pointerup", e);
    if (this.controls) this.controls.enabled = true;
  };

  private readonly onCanvasPointerMove = (e: PointerEvent): void => {
    this.forward("pointermove", e);
  };

  private readonly onCanvasClick = (e: MouseEvent): void => {
    this.forward("click", e);
  };

  private readonly onCanvasWheel = (e: WheelEvent): void => {
    this.forward("wheel", e);
  };

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number): void => {
      const dt = now - this.last;
      this.last = now;
      if (this.controls) {
        this.controls.autoRotate = this.state.autoOrbit;
        this.controls.update();
      }
      if (this.grid) this.grid.visible = this.state.grid;
      if (this.state.spin && this.adapter)
        this.adapter.mesh.rotation.y += dt * 0.0006;
      if (this.renderer && this.threeScene && this.camera) {
        this.renderer.render(this.threeScene, this.camera);
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.adapter?.vectoScene.start();
  }

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.adapter?.vectoScene.stop();
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.style.left = `${this.x}px`;
      this.canvas.style.top = `${this.y}px`;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    if (this.renderer) this.renderer.setSize(width, height, false);
    if (this.camera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
  }

  override destroy(): void {
    this.stopLoop();
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onCanvasPointerMove);
      this.canvas.removeEventListener("click", this.onCanvasClick);
      this.canvas.removeEventListener("wheel", this.onCanvasWheel);
    }
    window.removeEventListener("pointerdown", this.onWindowPointerDown, {
      capture: true,
    });
    window.removeEventListener("pointerup", this.onWindowPointerUp);

    this.controls?.dispose();
    // ThreeAdapter owns its own offscreen canvas, VectoJS Scene, and
    // CanvasTexture — its dispose() frees all of that; not calling it
    // would leak the adapter's inner Scene/texture on every navigation
    // away from this entry.
    this.adapter?.dispose();
    this.particles?.geometry.dispose();
    (this.particles?.material as THREE.Material | undefined)?.dispose();
    if (this.grid) {
      this.grid.geometry.dispose();
      const gridMat = this.grid.material;
      if (Array.isArray(gridMat)) gridMat.forEach((m) => m.dispose());
      else gridMat.dispose();
    }
    this.renderer?.dispose();
    this.canvas?.remove();
    this.fallbackEl?.remove();

    super.destroy();
  }

  override isPointInside(): boolean {
    return false;
  }

  override update(): void {
    /* driven by this entity's own requestAnimationFrame loop, not the Gallery's Scene tick */
  }

  override render(): void {
    /* nothing to draw through IRenderer — this entity's content lives on its own secondary canvas */
  }
}

export default Dimension;
