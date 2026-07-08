import { Scene, Entity, type IRenderer } from "@vectojs/core";
import { Button, Text, Stack } from "@vectojs/ui";
import MathArt from "./creations/math-art";

// Custom interface for creations metadata
interface Creation {
  id: string;
  title: string;
  author: string;
  description: string;
  entityClass: new () => Entity;
}

// Registry of creations
const CREATIONS: Creation[] = [
  {
    id: "math-art",
    title: "Mathematical Spiral Art",
    author: "VectoJS Core",
    description:
      "Fermat's spiral drawing rotating dots with procedural hues and connectors.",
    entityClass: MathArt,
  },
];

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
  const workspace = new Stack({ direction: "vertical", gap: 0 });

  // Function to load a creation
  const loadCreation = (creation: Creation | null) => {
    // Clean up current creation if any
    if (currentCreation) {
      workspace.remove(currentCreation);
      currentCreation = null;
    }

    if (creation) {
      const ActiveEntity = creation.entityClass;
      currentCreation = new ActiveEntity();
      currentCreation.width = workspace.width;
      currentCreation.height = workspace.height;
      workspace.add(currentCreation);
    } else {
      // Load default dashboard
      currentCreation = new Dashboard(workspace.width, workspace.height);
      workspace.add(currentCreation);
    }
    scene.markDirty();
  };

  // Add a Home / Reset button
  const homeBtn = new Button("🏠 Home Dashboard", {
    font: "500 14px Inter, sans-serif",
    onClick: () => loadCreation(null),
  });
  listStack.add(homeBtn);

  // Add buttons for each creation
  for (const c of CREATIONS) {
    const btn = new Button(`✨ ${c.title}`, {
      font: "500 14px Inter, sans-serif",
      onClick: () => loadCreation(c),
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

    scene.resize(W, H);

    sidebar.width = 280;
    sidebar.height = H;
    sidebarBg.width = 280;
    sidebarBg.height = H;

    workspace.width = W - 280;
    workspace.height = H;

    if (currentCreation) {
      currentCreation.width = workspace.width;
      currentCreation.height = workspace.height;
    }

    root.width = W;
    root.height = H;

    sidebar.layout();
    workspace.layout();
    root.layout();

    scene.markDirty();
  };

  window.addEventListener("resize", resize);

  // Initial size and dashboard load
  resize();
  loadCreation(null);

  // Start render loop
  scene.start();
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", initGallery);
