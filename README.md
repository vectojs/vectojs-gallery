# VectoJS Creative Gallery 🎨

The official interactive showcase for VectoJS creations, hosted at [gallery.vectojs.org](https://gallery.vectojs.org).

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

## About

This is a maintained showcase, not an open submission queue — every entry
is a first-party VectoJS demo, kept in sync with the framework's current
capabilities. It's not community-submitted, so there's no contribution
flow or PR template here.
