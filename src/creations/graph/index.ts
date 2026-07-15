import { Entity, ComputeParticleEntity, type IRenderer } from "@vectojs/core";
import { Button } from "@vectojs/ui";
import { buildLayout, CLUSTERS, type GraphLayout } from "./layout";
import { SpatialHash } from "./spatial-hash";

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

/** Draws the real backbone (root/hub/concept nodes + their connecting edges) and the
 * dim/highlight overlay on hover. Satellite dots are NOT drawn here — those are the
 * ComputeParticleEntity layers, added as children alongside this one. */
class GraphBackbone extends Entity {
  layout: GraphLayout;
  hoverIdx: number | null = null; // index into layout.nodes, or null
  zoom = 1;

  constructor(layout: GraphLayout) {
    super();
    this.layout = layout;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: -100000, y: -100000, width: 200000, height: 200000 };
  }
  isPointInside(): boolean {
    return false; // hover is driven externally via the spatial hash, not engine hit-testing
  }
  update(): void {
    /* static layout — nothing to simulate here */
  }

  private neighborsOf(idx: number): number[] {
    const out: number[] = [];
    for (const e of this.layout.edges) {
      if (e.a === idx) out.push(e.b);
      else if (e.b === idx) out.push(e.a);
    }
    return out;
  }

  render(r: IRenderer): void {
    const { nodes, edges, clusters } = this.layout;
    const hovered = this.hoverIdx;
    const hoverSet = new Set<number>();
    if (hovered !== null) {
      hoverSet.add(hovered);
      for (const n of this.neighborsOf(hovered)) hoverSet.add(n);
    }
    const dimmed = hovered !== null;

    // Edges (backbone only — one path, one stroke call regardless of count)
    r.beginPath();
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      r.moveTo(a.x, a.y);
      r.lineTo(b.x, b.y);
    }
    r.stroke(
      dimmed ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.28)",
      1.2 / this.zoom,
    );

    // Highlighted edges redrawn brighter on top
    if (dimmed) {
      r.beginPath();
      for (const e of edges) {
        if (hoverSet.has(e.a) && hoverSet.has(e.b)) {
          const a = nodes[e.a];
          const b = nodes[e.b];
          r.moveTo(a.x, a.y);
          r.lineTo(b.x, b.y);
        }
      }
      r.stroke("rgba(226,232,240,0.85)", 1.6 / this.zoom);
    }

    // Backbone nodes
    const labelZoomOk = this.zoom > 0.6;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const isHot = hoverSet.has(i);
      const alpha = !dimmed || isHot ? 1 : 0.16;
      const col = clusters[n.cluster]?.color ?? "#94a3b8";
      const ringColor = n.kind === "root" ? "#ffffff" : col;
      r.fillCircle(
        n.x,
        n.y,
        n.r,
        n.kind === "root" ? "#0d1424" : "#0a0e1a",
        alpha,
      );
      r.beginPath();
      r.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      r.stroke(ringColor, (n.kind === "root" ? 2.5 : 1.6) / this.zoom);
      if (n.kind === "root" || isHot) {
        r.fillCircle(n.x, n.y, n.r * 0.4, col, alpha);
      }

      const showLabel =
        n.label &&
        (n.kind === "root" || n.kind === "hub" || labelZoomOk || isHot);
      if (showLabel && n.label) {
        const font =
          n.kind === "root"
            ? `800 ${16 / this.zoom}px Inter, system-ui`
            : n.kind === "hub"
              ? `700 ${12 / this.zoom}px Inter, system-ui`
              : `500 ${9.5 / this.zoom}px Inter, system-ui`;
        const fpx =
          n.kind === "root"
            ? 16 / this.zoom
            : n.kind === "hub"
              ? 12 / this.zoom
              : 9.5 / this.zoom;
        ctext(
          r,
          n.label,
          n.x,
          n.y + n.r + fpx * 1.15,
          font,
          fpx,
          !dimmed || isHot ? "#e2e8f0" : "rgba(226,232,240,0.35)",
        );
      }
    }
  }
}

const SATELLITE_COUNT = 4000; // fixed at the old page's slider default; the tuning slider itself was dropped

/**
 * Wraps the old page's pan/zoom/hover/recenter logic — previously free
 * functions closed over module-level variables in `initGraph()` — as one
 * root Entity. The hover label (previously a separate DOM `<div>`
 * positioned by the page) is now drawn directly in `render()` instead,
 * since there's no per-demo stage container to host a floating element
 * against anymore.
 */
class KnowledgeGraph extends Entity {
  private canvas: HTMLCanvasElement | null = null;
  private layout: GraphLayout;
  private hash: SpatialHash;
  private backbone: GraphBackbone;
  private particleLayers: ComputeParticleEntity[] = [];
  private recenterBtn: Button;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private moved = false;
  private hoverLabel = "";
  private hoverX = 0;
  private hoverY = 0;

  constructor() {
    super("KnowledgeGraph");
    this.layout = buildLayout(SATELLITE_COUNT);
    this.hash = new SpatialHash(this.layout.nodes, 60);
    this.backbone = new GraphBackbone(this.layout);
    this.add(this.backbone);
    this.buildParticleLayers();

    this.recenterBtn = new Button("⊙ Recenter", {
      font: "600 13px Inter, system-ui",
      onClick: () => this.centerView(),
    });
    this.add(this.recenterBtn);

    this.canvas = document.getElementById(
      "gallery-canvas",
    ) as HTMLCanvasElement | null;
    if (this.canvas) {
      this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("dblclick", this.onDblClick);
    }
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.recenterBtn.setPosition(width - this.recenterBtn.width - 16, 16);
    this.centerView();
  }

  override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("dblclick", this.onDblClick);
    }
    // ComputeParticleEntity owns real GPU resources (WebGPU storage/uniform
    // buffers) that its own destroy() frees — removing it from the tree
    // alone wouldn't release them.
    for (const p of this.particleLayers) p.destroy();
    super.destroy();
  }

  override isPointInside(): boolean {
    return false;
  }

  override update(): void {
    /* static layout — nothing to simulate here, same as GraphBackbone */
  }

  private buildParticleLayers(): void {
    for (const p of this.particleLayers) this.remove(p);
    this.particleLayers = CLUSTERS.map((cl, ci) => {
      const pts = this.layout.nodes.filter(
        (n) => n.kind === "satellite" && n.cluster === ci,
      );
      const entity = new ComputeParticleEntity({
        maxParticles: Math.max(1, pts.length),
        size: 2.4,
        color: cl.color,
        springK: 0.2,
        damping: 0.9,
        bounceDamping: 0.6,
        maxVelocity: 40,
      });
      this.add(entity);
      entity.initRandomParticles(this.width, this.height);
      const flat = new Float32Array(pts.length * 2);
      for (let i = 0; i < pts.length; i++) {
        flat[i * 2] = pts[i].x;
        flat[i * 2 + 1] = pts[i].y;
      }
      entity.setOrigins(flat, true);
      return entity;
    });
  }

  private applyView(): void {
    this.backbone.setPosition(this.panX, this.panY);
    this.backbone.scaleX = this.zoom;
    this.backbone.scaleY = this.zoom;
    this.backbone.zoom = this.zoom;
    for (const p of this.particleLayers) {
      p.setPosition(this.panX, this.panY);
      p.scaleX = this.zoom;
      p.scaleY = this.zoom;
    }
  }

  private centerView(): void {
    this.zoom = 1;
    this.panX = this.width / 2;
    this.panY = this.height / 2;
    this.applyView();
  }

  /** Client coordinates → this entity's own local space (subtracts its screen offset). */
  private stagePoint(
    clientX: number,
    clientY: number,
  ): { sx: number; sy: number } {
    if (!this.canvas) return { sx: 0, sy: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return {
      sx: clientX - rect.left - this.x,
      sy: clientY - rect.top - this.y,
    };
  }

  private toWorld(sx: number, sy: number): { wx: number; wy: number } {
    return {
      wx: (sx - this.panX) / this.zoom,
      wy: (sy - this.panY) / this.zoom,
    };
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { sx, sy } = this.stagePoint(e.clientX, e.clientY);
    const { wx, wy } = this.toWorld(sx, sy);
    this.zoom = Math.min(
      6,
      Math.max(0.15, this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
    );
    this.panX = sx - wx * this.zoom;
    this.panY = sy - wy * this.zoom;
    this.applyView();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.moved = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      this.panX += dx;
      this.panY += dy;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.applyView();
      return;
    }
    const { sx, sy } = this.stagePoint(e.clientX, e.clientY);
    const { wx, wy } = this.toWorld(sx, sy);
    const idx = this.hash.nearest(wx, wy, 14 / this.zoom);
    const isSatellite =
      idx !== null && this.layout.nodes[idx].kind === "satellite";
    const nextBackboneHover = isSatellite ? null : idx;
    if (nextBackboneHover !== this.backbone.hoverIdx) {
      this.backbone.hoverIdx = nextBackboneHover;
    }
    this.updateHoverLabel(idx, sx, sy);
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onDblClick = (): void => {
    if (!this.moved) this.centerView();
  };

  private updateHoverLabel(idx: number | null, sx: number, sy: number): void {
    if (idx === null) {
      this.hoverLabel = "";
      return;
    }
    const n = this.layout.nodes[idx];
    const cluster = this.layout.clusters[n.cluster]?.label ?? "";
    this.hoverLabel =
      n.kind === "satellite"
        ? `${cluster} · ${this.layout.nodes[n.parent]?.label ?? "node"}`
        : (n.label ?? n.kind);
    this.hoverX = sx;
    this.hoverY = sy;
  }

  override render(r: IRenderer): void {
    if (!this.hoverLabel) return;
    const padding = 8;
    const textW = this.hoverLabel.length * 7;
    const x = this.hoverX + 16;
    const y = this.hoverY + 16;
    r.beginPath();
    r.roundRect(x, y, textW + padding * 2, 26, 6);
    r.fill("rgba(15, 23, 42, 0.9)");
    r.fillText(
      this.hoverLabel,
      x + padding,
      y + 18,
      "600 12px Inter, system-ui",
      "#e2e8f0",
    );
  }
}

export default KnowledgeGraph;
