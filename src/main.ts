import { Scene, Entity, type IRenderer } from "@vectojs/core";
import { Button, Text, Stack } from "@vectojs/ui";

// Custom interface for creations metadata
interface Creation {
  id: string;
  title: string;
  author: string;
  description: string;
  // A dynamic import thunk, not a direct class reference: each creation
  // becomes its own lazy-loaded chunk, so the initial bundle only ever pays
  // for creations a visitor actually opens. This keeps first-load time flat
  // as the gallery grows past a handful of community submissions, instead of
  // shipping every creation ever merged to every visitor up front.
  load: () => Promise<{ default: new () => Entity }>;
}

// Registry of creations
const CREATIONS: Creation[] = [
  {
    id: "node-editor",
    title: "Node Graph Editor",
    author: "VectoJS Core",
    description:
      "260 draggable, connected nodes with smooth pan and zoom — no DOM element per node or connector, just draw calls.",
    load: () => import("./creations/node-editor"),
  },
  {
    id: "math-art",
    title: "Mathematical Spiral Art",
    author: "VectoJS Core",
    description:
      "Fermat's spiral drawing rotating dots with procedural hues and connectors.",
    load: () => import("./creations/math-art"),
  },
];

// Deep-linking: #/creation/<id> in the URL hash. Hash-only routing means the
// server only ever sees a request for "/" — no rewrite rules needed on the
// static host for a path like /creation/math-art to resolve.
const HASH_PREFIX = "#/creation/";

function creationIdFromHash(): string | null {
  const hash = window.location.hash;
  return hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null;
}

// Below this viewport width the sidebar shrinks instead of holding a fixed
// 280px — a phone-width screen would otherwise be left with almost no room
// for the creation itself.
const MOBILE_BREAKPOINT = 700;

function sidebarWidthFor(viewportWidth: number): number {
  if (viewportWidth >= MOBILE_BREAKPOINT) return 280;
  return Math.round(Math.max(140, Math.min(220, viewportWidth * 0.5)));
}

class SidebarBackground extends Entity {
  constructor(width: number, height: number) {
    super("SidebarBackground");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("rgba(11, 15, 25, 0.95)");
    r.stroke("rgba(255, 255, 255, 0.08)", 1);
  }
}

class Dashboard extends Entity {
  constructor(width: number, height: number) {
    super("Dashboard");
    this.width = width;
    this.height = height;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    // Fill main workspace background
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("#080b11");

    // Title
    r.fillText(
      "VectoJS Creative Gallery",
      40,
      80,
      "600 36px Outfit, sans-serif",
      "#ffffff",
    );

    // Subtitle
    r.fillText(
      "Explore community-driven interactive canvas creations built natively with VectoJS.",
      40,
      120,
      "18px Inter, sans-serif",
      "#9ca3af",
    );

    // Grid of instructions / PR guidelines
    r.fillText(
      "Submission Guidelines (PR Workflow)",
      40,
      200,
      "600 24px Outfit, sans-serif",
      "#ffffff",
    );

    const steps = [
      "1. Create Your Creation: Write your logic by extending the VectoJS Entity class (e.g. SpiralArt extends Entity).",
      "2. Sandbox Your Code: Place your file under src/creations/ (e.g. src/creations/math-art.ts).",
      "3. Registry Binding: Add your creation details to the CREATIONS registry inside src/main.ts.",
      "4. Pull Request Rule: Ensure your commit follows standard guidelines. Make sure no other files are mutated.",
      "5. Continuous Deployment: Once merged into main, GitHub Actions CI/CD automatically deploys to gallery.vectojs.org.",
    ];

    let y = 250;
    for (const step of steps) {
      r.fillText(step, 40, y, "15px Inter, sans-serif", "#d1d5db");
      y += 35;
    }

    // Rules box
    r.beginPath();
    r.roundRect(40, y + 20, this.width - 80, 150, 12);
    r.fill("rgba(99, 102, 241, 0.05)");
    r.stroke("rgba(99, 102, 241, 0.2)", 1);

    r.fillText(
      "⚠️ IMPORTANT CONTRIBUTOR RULES",
      60,
      y + 60,
      "600 16px Inter, sans-serif",
      "#818cf8",
    );

    r.fillText(
      "• No external library imports outside of VectoJS (@vectojs/core, @vectojs/ui) and Three.js (@vectojs/three).",
      60,
      y + 90,
      "14px Inter, sans-serif",
      "#9ca3af",
    );

    r.fillText(
      "• Each work must credit the original author and provide their profile link.",
      60,
      y + 115,
      "14px Inter, sans-serif",
      "#9ca3af",
    );

    r.fillText(
      "• Respect namespace: Keep all files strictly inside src/creations/ to avoid merge conflicts.",
      60,
      y + 140,
      "14px Inter, sans-serif",
      "#9ca3af",
    );
  }
}

/**
 * A plain fixed-size container: holds one child (the active creation or a
 * placeholder) without auto-sizing itself. `Stack` was tried here first, but
 * `Stack.layout()` unconditionally recomputes its own width/height to fit its
 * children on every `add()` — exactly wrong for something meant to be a fixed
 * viewport that whatever's loaded into it should fill.
 */
class Workspace extends Entity {
  constructor() {
    super("Workspace");
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(_r: IRenderer): void {}
}

class Divider extends Entity {
  constructor() {
    super("Divider");
    this.width = 232;
    this.height = 1;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.stroke("rgba(255, 255, 255, 0.08)", 1);
  }
}

function initGallery(): void {
  const canvas = document.getElementById(
    "gallery-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;

  const scene = new Scene(canvas, { maxFPS: 60 });
  const root = new Stack({ direction: "horizontal", gap: 0 });
  scene.add(root);

  let currentCreation: Entity | null = null;

  // Sidebar container
  const sidebar = new Stack({ direction: "vertical", gap: 16 });
  sidebar.padding = 24;

  // Add sidebar title & header
  const title = new Text("VectoJS Gallery", {
    font: "600 24px Outfit, sans-serif",
    color: "#ffffff",
  });
  const subtitle = new Text("Native Showcase", {
    font: "14px Inter, sans-serif",
    color: "#6366f1",
  });

  sidebar.add(title);
  sidebar.add(subtitle);

  // Divider line
  const divider = new Divider();
  sidebar.add(divider);

  // List of creation buttons
  const listStack = new Stack({ direction: "vertical", gap: 10 });
  sidebar.add(listStack);

  // Workspace container
  const workspace = new Workspace();

  // Bumped on every call so a slow import resolving after a newer selection
  // was made doesn't clobber whatever the user has since clicked into.
  let loadSeq = 0;

  // Tracks which creation is currently loaded/loading. navigateTo() calls
  // loadCreation() directly AND updates the URL hash, which itself fires a
  // hashchange event that calls loadCreation() again for the same target —
  // without this guard, the first (now-superseded) call's placeholder is
  // never cleaned up, since its `seq !== loadSeq` check makes it bail out
  // before reaching the removal code.
  let activeId: string | null = null;

  // Function to load a creation
  const loadCreation = (creation: Creation | null): void => {
    const id = creation?.id ?? null;
    if (id === activeId) return;
    activeId = id;

    const seq = ++loadSeq;

    if (currentCreation) {
      workspace.remove(currentCreation);
      currentCreation = null;
    }

    if (!creation) {
      currentCreation = new Dashboard(workspace.width, workspace.height);
      workspace.add(currentCreation);
      scene.markDirty();
      return;
    }

    const placeholder = new Text("Loading…", {
      font: "16px Inter, sans-serif",
      color: "#6b7280",
    });
    placeholder.setPosition(24, 24);
    workspace.add(placeholder);
    scene.markDirty();

    creation
      .load()
      .then(({ default: EntityClass }) => {
        if (seq !== loadSeq) return; // superseded by a later selection
        workspace.remove(placeholder);
        currentCreation = new EntityClass();
        currentCreation.width = workspace.width;
        currentCreation.height = workspace.height;
        workspace.add(currentCreation);
        scene.markDirty();
      })
      .catch((err: unknown) => {
        if (seq !== loadSeq) return;
        console.error(`Failed to load creation "${creation.id}":`, err);
        workspace.remove(placeholder);
        const errorText = new Text("Failed to load this creation.", {
          font: "16px Inter, sans-serif",
          color: "#f87171",
        });
        errorText.setPosition(24, 24);
        currentCreation = errorText;
        workspace.add(errorText);
        scene.markDirty();
      });
  };

  // Reflects the current selection into the URL hash (so it's shareable /
  // bookmarkable / survives a refresh), skipping the write if we're already
  // there (e.g. when this call originated from a hashchange event).
  const setHash = (id: string | null): void => {
    const next = id ? `${HASH_PREFIX}${id}` : "";
    if (window.location.hash !== next) {
      if (next) window.location.hash = next;
      else
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
    }
  };

  // Wraps loadCreation to keep the URL hash in sync with whatever's showing.
  const navigateTo = (creation: Creation | null): void => {
    loadCreation(creation);
    setHash(creation?.id ?? null);
  };

  // Add a Home / Reset button
  const homeBtn = new Button("🏠 Home Dashboard", {
    font: "500 14px Inter, sans-serif",
    onClick: () => navigateTo(null),
  });
  listStack.add(homeBtn);

  // Add buttons for each creation
  for (const c of CREATIONS) {
    const btn = new Button(`✨ ${c.title}`, {
      font: "500 14px Inter, sans-serif",
      onClick: () => navigateTo(c),
    });
    listStack.add(btn);
  }

  // Sidebar background entity
  const sidebarBg = new SidebarBackground(280, window.innerHeight);
  sidebar.add(sidebarBg);

  root.add(sidebar);
  root.add(workspace);

  // Resize handler
  const resize = (): void => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sbWidth = sidebarWidthFor(W);

    scene.resize(W, H);

    sidebar.width = sbWidth;
    sidebar.height = H;
    sidebarBg.width = sbWidth;
    sidebarBg.height = H;

    workspace.width = W - sbWidth;
    workspace.height = H;

    if (currentCreation) {
      currentCreation.width = workspace.width;
      currentCreation.height = workspace.height;
    }

    root.width = W;
    root.height = H;

    sidebar.layout();
    root.layout();

    scene.markDirty();
  };

  window.addEventListener("resize", resize);

  // Back/forward navigation and manually-edited/shared URLs.
  window.addEventListener("hashchange", () => {
    const id = creationIdFromHash();
    const match = id ? (CREATIONS.find((c) => c.id === id) ?? null) : null;
    loadCreation(match);
  });

  // Initial size and load: honor a deep link if the URL already has one.
  resize();
  const initialId = creationIdFromHash();
  const initialCreation = initialId
    ? (CREATIONS.find((c) => c.id === initialId) ?? null)
    : null;
  loadCreation(initialCreation);

  // Start render loop
  scene.start();
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", initGallery);
