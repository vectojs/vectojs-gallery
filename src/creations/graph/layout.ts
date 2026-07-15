/**
 * Static, seeded layout for the knowledge-graph demo. No force-directed simulation —
 * positions are computed once by formula, so regenerating at 20,000 nodes costs the
 * same single pass as 500. A seeded PRNG keyed by (cluster, index) means growing the
 * satellite slider only ADDS nodes; it never reshuffles ones already on screen.
 */

export interface ClusterDef {
  key: string;
  label: string;
  color: string;
}

export interface ConceptDef {
  label: string;
  cluster: string;
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  r: number;
  cluster: number; // index into CLUSTERS
  label: string | null; // null = satellite (no persistent label)
  kind: "root" | "hub" | "concept" | "satellite";
  parent: number; // index of the parent node in the flat `nodes` array, -1 for root
}

export interface GraphEdge {
  a: number; // index into `nodes`
  b: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[]; // backbone edges only (root–hub–concept) — satellites imply
  // membership by position + color, not a drawn line (thousands of radiating
  // lines added visual noise without adding information).
  clusters: ClusterDef[];
}

// Per-cluster hue, so which package a node belongs to reads at a glance from the
// satellite cloud itself, not just from the hub label. (A prior pass unified these
// into one hue on the theory that four colors read as a "confusing rainbow" —
// reverted 2026-07-03 after real-device testing found a single color for
// everything actually less informative, not more.)
export const CLUSTERS: ClusterDef[] = [
  { key: "core", label: "@vectojs/core", color: "#38bdf8" }, // sky
  { key: "ui", label: "@vectojs/ui", color: "#a78bfa" }, // violet
  { key: "three", label: "@vectojs/three", color: "#4ade80" }, // green
  { key: "vectomancy", label: "Vectomancy", color: "#fbbf24" }, // amber
];

const CONCEPTS: ConceptDef[] = [
  { label: "Scene", cluster: "core" },
  { label: "Entity", cluster: "core" },
  { label: "LayoutEngine", cluster: "core" },
  { label: "IRenderer", cluster: "core" },
  { label: "ComputeParticleEntity", cluster: "core" },
  { label: "Virtual Math Tree", cluster: "core" },
  { label: "Spatial Hash Grid", cluster: "core" },
  { label: "Button", cluster: "ui" },
  { label: "Text", cluster: "ui" },
  { label: "RichText", cluster: "ui" },
  { label: "Markdown", cluster: "ui" },
  { label: "ScrollView", cluster: "ui" },
  { label: "Stack", cluster: "ui" },
  { label: "ThreeAdapter", cluster: "three" },
  { label: "ThreeRenderer", cluster: "three" },
  { label: "WebXR", cluster: "three" },
  { label: "Raycasting", cluster: "three" },
  { label: "Spline Import", cluster: "vectomancy" },
  { label: "Vector Paths", cluster: "vectomancy" },
  { label: "Design Sync", cluster: "vectomancy" },
];

// Deterministic PRNG (mulberry32) — same seed always produces the same sequence,
// so a given satellite index always lands in the same spot regardless of how many
// OTHER satellites exist. That's what makes the count slider stable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOT_R = 30;
const HUB_R = 18;
const CONCEPT_R = 8;
const SAT_R = 2.4;
const HUB_RADIUS = 260; // world-space distance from root to hub ring
const CONCEPT_RADIUS = 110; // distance from a hub to its concept ring
const SAT_RADIUS_MIN = 40; // satellite cloud starts this far from its concept parent
const SAT_RADIUS_SPREAD = 170; // ...and jitters out up to this much further

/** Build the full layout for a given total satellite budget. Pure function of
 * `satelliteCount` — same input always produces the same output. */
export function buildLayout(satelliteCount: number): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Root
  nodes.push({
    id: "root",
    x: 0,
    y: 0,
    r: ROOT_R,
    cluster: 0,
    label: "VectoJS",
    kind: "root",
    parent: -1,
  });
  const rootIdx = 0;

  // Hubs — evenly spaced ring around root
  const hubIdx: number[] = [];
  CLUSTERS.forEach((c, i) => {
    const a = (i / CLUSTERS.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * HUB_RADIUS;
    const y = Math.sin(a) * HUB_RADIUS;
    nodes.push({
      id: `hub:${c.key}`,
      x,
      y,
      r: HUB_R,
      cluster: i,
      label: c.label,
      kind: "hub",
      parent: rootIdx,
    });
    hubIdx.push(nodes.length - 1);
    edges.push({ a: rootIdx, b: nodes.length - 1 });
  });

  // Concepts — ring around their hub
  const conceptIdxByCluster: number[][] = CLUSTERS.map(() => []);
  const conceptsByCluster: ConceptDef[][] = CLUSTERS.map(() => []);
  for (const c of CONCEPTS) {
    const ci = CLUSTERS.findIndex((cl) => cl.key === c.cluster);
    conceptsByCluster[ci].push(c);
  }
  CLUSTERS.forEach((cl, ci) => {
    const hub = nodes[hubIdx[ci]];
    const list = conceptsByCluster[ci];
    list.forEach((concept, j) => {
      const a = (j / list.length) * Math.PI * 2 + ci; // offset per cluster so rings don't align
      const x = hub.x + Math.cos(a) * CONCEPT_RADIUS;
      const y = hub.y + Math.sin(a) * CONCEPT_RADIUS;
      nodes.push({
        id: `concept:${cl.key}:${j}`,
        x,
        y,
        r: CONCEPT_R,
        cluster: ci,
        label: concept.label,
        kind: "concept",
        parent: hubIdx[ci],
      });
      const idx = nodes.length - 1;
      conceptIdxByCluster[ci].push(idx);
      edges.push({ a: hubIdx[ci], b: idx });
    });
  });

  // Satellites — deterministic scattered cloud around a concept parent, distributed
  // round-robin across concepts within a cluster so growth stays visually even. Each
  // cluster gets its OWN PRNG stream (seeded off the cluster index) so one cluster's
  // satellite count changing can never shift another cluster's random sequence —
  // that's what keeps every already-placed dot stable as the slider grows.
  const perClusterCount = CLUSTERS.map(() => 0);
  for (let i = 0; i < satelliteCount; i++) {
    perClusterCount[i % CLUSTERS.length]++;
  }
  CLUSTERS.forEach((cl, ci) => {
    const concepts = conceptIdxByCluster[ci];
    if (concepts.length === 0) return;
    const rand = mulberry32(20260701 + ci * 97);
    for (let s = 0; s < perClusterCount[ci]; s++) {
      const parentIdx = concepts[s % concepts.length];
      const parent = nodes[parentIdx];
      const a = rand() * Math.PI * 2;
      const r = SAT_RADIUS_MIN + rand() * SAT_RADIUS_SPREAD;
      const jitter = (rand() - 0.5) * 14;
      nodes.push({
        id: `sat:${cl.key}:${s}`,
        x: parent.x + Math.cos(a) * r + jitter,
        y: parent.y + Math.sin(a) * r + jitter,
        r: SAT_R,
        cluster: ci,
        label: null,
        kind: "satellite",
        parent: parentIdx,
      });
    }
  });

  return { nodes, edges, clusters: CLUSTERS };
}
