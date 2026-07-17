import type { Accent } from "./ui/tokens";

/**
 * One forge application shown in the "Built on VectoJS" section: a full
 * product built on the published `@vectojs/*` packages, living in its own
 * repository and deployed on its own canonical domain. The gallery links out —
 * it never embeds these apps.
 *
 * `screenshot` paths are committed under `public/apps/` (captured from the
 * live deployments; refresh them when an app's UI changes materially).
 */
export interface ForgeApp {
  id: string;
  name: string;
  tagline: string;
  /** Canonical URL the card opens (and displays, sans protocol). */
  url: string;
  screenshot: string;
  accent: Accent;
}

export const APPS: ForgeApp[] = [
  {
    id: "numera",
    name: "Numera",
    tagline:
      "An offline consumer spreadsheet — virtualized grid, formula engine, XLSX import and export.",
    // Canonical numera-website.vectojs.org is not wired up yet (DNS); switch
    // this to the canonical domain once it resolves.
    url: "https://numera-website.pages.dev",
    screenshot: "/apps/numera.webp",
    accent: { a: "#2563eb", b: "#7dd3fc", glow: "#3b82f6" },
  },
  {
    id: "brings",
    name: "Brings",
    tagline:
      "A local-first vector design editor — pages, frames, shapes, and selection on an infinite canvas.",
    url: "https://brings-website.vectojs.org",
    screenshot: "/apps/brings.webp",
    accent: { a: "#6d5ef2", b: "#a78bfa", glow: "#7c5cff" },
  },
  {
    id: "vem",
    name: "Vem",
    tagline:
      "A canvas-native Vim-style modal editor — buffers, splits, a file explorer, and a plugin lab.",
    url: "https://vem.run",
    screenshot: "/apps/vem.webp",
    accent: { a: "#334155", b: "#60a5fa", glow: "#3b82f6" },
  },
  {
    id: "unisol",
    name: "Unisol",
    tagline:
      "An interactive 3D map of the Kubernetes resource model, rendered with @vectojs/graph3d.",
    url: "https://unisol.vectojs.org",
    screenshot: "/apps/unisol.webp",
    accent: { a: "#155e75", b: "#22d3ee", glow: "#06b6d4" },
  },
  {
    id: "motif",
    name: "Motif",
    tagline:
      "The component and effect gallery — every @vectojs/ui component demoed live, with source.",
    url: "https://motif.vectojs.org",
    screenshot: "/apps/motif.webp",
    accent: { a: "#d97757", b: "#f2b880", glow: "#d97757" },
  },
];

/** "https://example.org/x" -> "example.org/x" for display on cards. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
