# VectoJS Creative Gallery 🎨

The official, community-driven interactive showcase for VectoJS creations, hosted at [gallery.vectojs.org](https://gallery.vectojs.org).

Unlike traditional documentation websites, **this entire gallery website is built natively on the VectoJS Canvas engine**. All layouts, sidebars, buttons, and interactions are rendered procedurally on a single `<canvas>` using `@vectojs/core` and `@vectojs/ui`.

---

## 🛠️ Tech Stack & Rules

- **Core**: HTML5 Canvas, TypeScript, `@vectojs/core`
- **UI Components**: `@vectojs/ui` (`Stack`, `Button`, `Text`)
- **Bundler**: Vite (fast, lightweight compilation)
- **Deployment**: Cloudflare Pages (via GitHub Actions CI/CD)

---

## 🚀 How to Run Locally

First, clone this repository and make sure you have [Bun](https://bun.sh) installed.

1. **Install Dependencies**:

   ```bash
   bun install
   ```

2. **Start Development Server**:

   ```bash
   bun run dev
   ```

   Open `http://localhost:2222` to see the live native canvas gallery interface.

3. **Production Build**:
   ```bash
   bun run build
   ```

---

## ✍️ How to Submit Your Work (PR Workflow)

We welcome developers to showcase their creative animations, physics simulations, games, and math art! To add your creation to the gallery, follow these guidelines:

### 1. Create your VectoJS Entity Class

Write your project as a self-contained TypeScript class extending `Entity` from `@vectojs/core`. Ensure it uses the canvas width and height dynamically so it is responsive.

Save your code in a dedicated file inside `src/creations/` (e.g. `src/creations/yourname-creation.ts`):

```typescript
import { Entity, type IRenderer } from "@vectojs/core";

export default class MyCreation extends Entity {
  private angle = 0;

  constructor() {
    super("MyCreation");
  }

  override update(dt: number): void {
    super.update(dt);
    this.angle += dt * 0.002;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill("#0b0f19");

    // Draw your creative art here...
  }
}
```

### 2. Register your Creation

Open `src/main.ts` and add your metadata to the `CREATIONS` list:

```typescript
import MyCreation from "./creations/yourname-creation";

const CREATIONS: Creation[] = [
  // ... existing entries
  {
    id: "my-creation",
    title: "Procedural Neon Flower",
    author: "Your Name (@yourhandle)",
    description:
      "An interactive multi-layered rotating canvas flower responding to mouse drags.",
    entityClass: MyCreation,
  },
];
```

### 3. Submission Guidelines

To keep the showcase clean and safe, all PRs must comply with the following:

- **Framework Standard**: Use only standard VectoJS drawing methods. No raw canvas-context manipulation or external libraries outside of VectoJS and Three.js.
- **Credits**: Please specify your developer link (GitHub, Twitter/X, or personal website) inside the author attribute.
- **No Pollution**: Keep all custom source files strictly inside the `src/creations/` directory. Do not modify any configuration files or other developers' directories.

### 4. Merge & Auto-Deployment

Once you open a Pull Request and it gets approved and merged into the `main` branch, our GitHub Actions CI/CD pipeline will automatically build and publish the changes to [gallery.vectojs.org](https://gallery.vectojs.org).
