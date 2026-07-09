import { Entity, type IRenderer } from "@vectojs/core";

/**
 * A Figma/ComfyUI-style node graph: hundreds of draggable, connected nodes,
 * smooth pan and zoom, at a density that would mean one DOM element per node
 * (and one per connector) in the traditional approach. Here it's draw calls.
 *
 * Deliberately does NOT set `interactive = true` per node — that would
 * project a real shadow DOM element per node and defeat the entire point.
 * Instead this one Entity is itself interactive and does its own hit-testing
 * against a plain array of node data, exactly the pattern VectoJS expects for
 * anything rendered at scale (see GridTextEntity in @vectojs/core for the
 * same idea taken further).
 */

interface GraphNode {
  id: number;
  x: number;
  y: number;
  radius: number;
  label: string;
  hue: number;
}

interface GraphEdge {
  from: number;
  to: number;
}

const NODE_COUNT = 260;
const CLUSTER_COUNT = 6;

export default class NodeEditor extends Entity {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];

  private panX = 0;
  private panY = 0;
  private zoom = 1;

  private draggingNodeId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private panning = false;
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;

  private time = 0;
  private fps = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor() {
    super("NodeEditor");
    this.interactive = true;
    this.generateGraph();
    this.wireEvents();
  }

  private generateGraph(): void {
    const clusters = Array.from({ length: CLUSTER_COUNT }, () => ({
      x: (Math.random() - 0.5) * 1400,
      y: (Math.random() - 0.5) * 900,
    }));

    for (let i = 0; i < NODE_COUNT; i++) {
      const cluster = clusters[i % CLUSTER_COUNT];
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 180;
      this.nodes.push({
        id: i,
        x: cluster.x + Math.cos(angle) * dist,
        y: cluster.y + Math.sin(angle) * dist,
        radius: 5 + Math.random() * 6,
        label: `node_${i}`,
        hue: (i * 47) % 360,
      });
    }

    // A handful of edges per node to nearby nodes in the same cluster, so the
    // graph reads as connected clusters rather than a uniform point cloud.
    for (let i = 0; i < NODE_COUNT; i++) {
      const clusterStart =
        Math.floor(i / (NODE_COUNT / CLUSTER_COUNT)) *
        (NODE_COUNT / CLUSTER_COUNT);
      const clusterSize = Math.floor(NODE_COUNT / CLUSTER_COUNT);
      const connections = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < connections; c++) {
        const to = clusterStart + Math.floor(Math.random() * clusterSize);
        if (to !== i) this.edges.push({ from: i, to });
      }
    }
  }

  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return (
      local.x >= 0 &&
      local.x <= this.width &&
      local.y >= 0 &&
      local.y <= this.height
    );
  }

  private screenToGraph(sx: number, sy: number): { x: number; y: number } {
    const cx = this.width / 2;
    const cy = this.height / 2;
    return {
      x: (sx - cx - this.panX) / this.zoom,
      y: (sy - cy - this.panY) / this.zoom,
    };
  }

  private hitTestNode(sx: number, sy: number): GraphNode | null {
    const p = this.screenToGraph(sx, sy);
    // Reverse order: nodes drawn later (on top) should win ties.
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      const hitRadius = n.radius + 6; // a little slack, easier to grab
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return n;
    }
    return null;
  }

  private wireEvents(): void {
    this.on("pointerdown", (e: any) => {
      const x = e.localX as number | undefined;
      const y = e.localY as number | undefined;
      if (x === undefined || y === undefined) return;

      const hit = this.hitTestNode(x, y);
      if (hit) {
        this.draggingNodeId = hit.id;
        const p = this.screenToGraph(x, y);
        this.dragOffsetX = hit.x - p.x;
        this.dragOffsetY = hit.y - p.y;
      } else {
        this.panning = true;
        this.panStartClientX = x;
        this.panStartClientY = y;
        this.panStartX = this.panX;
        this.panStartY = this.panY;
      }
    });

    this.on("pointermove", (e: any) => {
      const x = e.localX as number | undefined;
      const y = e.localY as number | undefined;
      if (x === undefined || y === undefined) return;

      if (this.draggingNodeId !== null) {
        const node = this.nodes.find((n) => n.id === this.draggingNodeId);
        if (node) {
          const p = this.screenToGraph(x, y);
          node.x = p.x + this.dragOffsetX;
          node.y = p.y + this.dragOffsetY;
        }
        this.scene?.markDirty();
      } else if (this.panning) {
        this.panX = this.panStartX + (x - this.panStartClientX);
        this.panY = this.panStartY + (y - this.panStartClientY);
        this.scene?.markDirty();
      }
    });

    const endInteraction = (): void => {
      this.draggingNodeId = null;
      this.panning = false;
    };
    this.on("pointerup", endInteraction);
    this.on("pointerleave", endInteraction);

    this.on("wheel", (e: any) => {
      e.preventDefault?.();
      const delta = (e.deltaY as number | undefined) ?? 0;
      const next = this.zoom * (delta > 0 ? 0.9 : 1.1);
      this.zoom = Math.max(0.25, Math.min(3, next));
      this.scene?.markDirty();
    });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.time = time * 0.001;

    // Gentle idle drift so the graph feels alive when nobody's touching it,
    // pausing whichever node is actively being dragged.
    for (const n of this.nodes) {
      if (n.id === this.draggingNodeId) continue;
      n.x += Math.sin(this.time * 0.6 + n.id) * 0.03;
      n.y += Math.cos(this.time * 0.5 + n.id * 1.3) * 0.03;
    }

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    // Idle drift above mutates state directly, not through the tracked
    // driver/tween system, so Scene can't tell this is animating and would
    // throttle to 2fps after the first frame without this.
    this.scene?.markDirty();
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("#05070c");

    const cx = this.width / 2 + this.panX;
    const cy = this.height / 2 + this.panY;

    r.save();
    r.translate(cx, cy);
    r.scale(this.zoom, this.zoom);

    // Edges first, so nodes draw on top of their own connectors.
    for (const edge of this.edges) {
      const a = this.nodes[edge.from];
      const b = this.nodes[edge.to];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 24;
      r.beginPath();
      r.moveTo(a.x, a.y);
      r.bezierCurveTo(mx, my, mx, my, b.x, b.y);
      r.stroke("rgba(99, 102, 241, 0.25)", 1.5 / this.zoom);
    }

    for (const n of this.nodes) {
      const isDragging = n.id === this.draggingNodeId;
      const color = `hsla(${n.hue}, 75%, ${isDragging ? 70 : 60}%, 0.9)`;
      r.beginPath();
      r.arc(n.x, n.y, isDragging ? n.radius * 1.3 : n.radius, 0, Math.PI * 2);
      r.fill(color);
      if (isDragging) {
        r.stroke("rgba(255, 255, 255, 0.8)", 2 / this.zoom);
      }
    }

    r.restore();

    // HUD: reinforces the actual point of this demo directly on the canvas.
    r.fillText(
      `${this.nodes.length} nodes · ${this.edges.length} connections · ${this.fps || "…"} fps`,
      16,
      this.height - 20,
      "13px Inter, sans-serif",
      "rgba(148, 163, 184, 0.8)",
    );
    r.fillText(
      "Drag a node · drag empty space to pan · scroll to zoom",
      16,
      24,
      "13px Inter, sans-serif",
      "rgba(148, 163, 184, 0.8)",
    );
  }
}
