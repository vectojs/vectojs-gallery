# VectoJS Creative Gallery Agent Guide 🤖

Welcome to the **VectoJS Creative Gallery** repository! This guide provides specialized context, architecture maps, and constraints for AI Coding Agents (such as Gemini, Claude, or Copilot) working in this codebase.

---

## 🌲 Architecture Map

This website is a **VectoJS Native Canvas Application** (no Astro, React, or standard HTML/CSS templates). The entire UI layout (sidebar, button lists, text, divider line) and showcase creations are rendered procedurally on a single full-screen canvas.

- **`/index.html`**: Entry point containing a single `<canvas id="gallery-canvas">` and importing `/src/main.ts`.
- **`/src/main.ts`**: Bootstraps the VectoJS `Scene` and wires the `Rail`/`Bed`/`CaptionPlate` UI components together; mounts/unmounts the open creation.
- **`/src/registry.ts`**: The `Creation` type and the `CREATIONS` registry array.
- **`/src/apps.ts`**: The `ForgeApp` manifest behind the "Built on VectoJS" section — name, tagline, canonical URL, accent, and a committed screenshot under `public/apps/`.
- **`/src/ui/`**: The catalog UI components (`Rail`, `Bed`, `Masthead`, `SectionHeader`, `CreationCard`, `AppCard`, `SubmitCard`, `CaptionPlate`, `BackChip`, `DotGridBackground`, `ThumbDoodle`, design tokens).
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

### 🎨 Creation theme contract (required for every new demo)

The catalog chrome is warm-white; an open creation runs on a **Stage** backdrop
that defaults to dark (`#06070a`). To keep new demos looking intentional:

1. **Declare your backdrop.** If the creation is authored for anything other
   than the default dark theater, set `stage: "<css color>"` in its registry
   entry — never paint your own full-bleed background and let a mismatched
   Stage leak around it.
2. **Own an accent.** Add the creation's two-stop gradient to `ACCENT` in
   `src/ui/tokens.ts`; the card thumbnail, rail dot, and hover glow all key off
   it. Pick stops that read on the warm-cream card ground.
3. **Respect your bounds.** The workspace starts at `x = RAIL_WIDTH`; everything
   you draw must stay inside your entity's box. If you use the GPU point /
   particle layer, know that it is a stacked full-window canvas that ignores
   your entity's transform: offset seed coordinates by `getGlobalPosition()`
   (see `creations/nexus`) — the shell clips stacked canvases to the workspace,
   but correct placement is your job.
4. **Verify against the frame.** Open the demo via the catalog (not standalone):
   the Rail, the `← Gallery` back chip (top-left), and the caption plate
   (bottom-left) must all stay visible, uncovered, and clickable. Bottom-left
   content should account for the collapsed caption tab.

---

## 🚨 Guidelines for AI Agents

- **Read first**: Always inspect `src/main.ts` and `src/creations/` before starting code changes.
- **Strict Sandbox**: Keep your files inside `src/creations/`. Never modify bundler configurations or `.github/` workflows unless instructed by the user.
- **Verify Builds**: Before completing your task, run `bun run build` locally and ensure 0 TypeScript compilation errors or linter warnings.
