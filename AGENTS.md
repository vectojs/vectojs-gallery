# VectoJS Creative Gallery Agent Guide 🤖

Welcome to the **VectoJS Creative Gallery** repository! This guide provides specialized context, architecture maps, and constraints for AI Coding Agents (such as Gemini, Claude, or Copilot) working in this codebase.

---

## 🌲 Architecture Map

This website is a **VectoJS Native Canvas Application** (no Astro, React, or standard HTML/CSS templates). The entire UI layout (sidebar, button lists, text, divider line) and showcase creations are rendered procedurally on a single full-screen canvas.

- **`/index.html`**: Entry point containing a single `<canvas id="gallery-canvas">` and importing `/src/main.ts`.
- **`/src/main.ts`**: Bootstraps the VectoJS `Scene` and wires the `Rail`/`Bed`/`CaptionPlate` UI components together; mounts/unmounts the open creation.
- **`/src/registry.ts`**: The `Creation` type and the `CREATIONS` registry array.
- **`/src/ui/`**: The catalog UI components (`Rail`, `Bed`, `CreationCard`, `CaptionPlate`, `DotGridBackground`, `ThumbDoodle`, design tokens).
- **`/src/creations/`**: One subfolder per showcased demo (e.g. `/src/creations/nexus/`). Maintained first-party code, not a community-submission sandbox.

---

## 🛠️ Tooling & Standards

- **Package Manager**: Bun is preferred (`bun install`, `bun run dev`, `bun run build`). NPM is also supported as a fallback.
- **Linter & Formatter**:
  - Formatter: **Prettier** is strictly enforced (`prettier --write .`).
  - Linter: **Oxlint** (`oxlint`) is used for extreme performance static analysis.
- **TypeScript Settings**: `tsconfig.json` runs in strict resolution mode. Make sure all imports use clean extensions.
- **Git Hygiene**: Showcase entries live under `src/creations/<id>/`; registry metadata lives in `src/registry.ts`, not `src/main.ts` (which only bootstraps the `Scene` and wires the UI components together).

---

## ✍️ Adding a New Showcase Entry

1. Create `src/creations/<id>/index.ts`, default-exporting a class that extends `Entity` from `@vectojs/core` (`isPointInside`, `render`, and — if animated — `update`, calling `super.update(dt, time)`).
2. Register it in `CREATIONS` in `src/registry.ts`: `id`, `title`, `description`, `tags`, and a lazy `load: () => import("./creations/<id>")` thunk.
3. `bun run format:check && bun run lint && bun run test && bun run build` must all pass.

---

## 🚨 Guidelines for AI Agents

- **Read first**: Always inspect `src/main.ts` and `src/creations/` before starting code changes.
- **Strict Sandbox**: Keep your files inside `src/creations/`. Never modify bundler configurations or `.github/` workflows unless instructed by the user.
- **Verify Builds**: Before completing your task, run `bun run build` locally and ensure 0 TypeScript compilation errors or linter warnings.
