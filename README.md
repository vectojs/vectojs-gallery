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

## ✍️ How to Submit Your Work

We welcome developers to showcase their creative animations, physics simulations, games, and math art! Every creation is one self-contained VectoJS `Entity`, submitted as a pull request.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide: the exact steps, the rules (VectoJS-only imports, no network access, sandbox your files, credit your GitHub profile), and how review/deployment works. The PR template covers the same checklist inline when you open a PR.

Once your PR is approved and merged into `main`, GitHub Actions automatically builds and deploys the change to [gallery.vectojs.org](https://gallery.vectojs.org) — no separate release step.
