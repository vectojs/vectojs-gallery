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
  - Formatter: **oxfmt** is the authority (`bun run format` / `bun run format:check`). Prettier is gone — it is not in `devDependencies` and there is no `.prettierrc`. Single quotes in TS/JS, trailing commas everywhere.
  - Linter: **Oxlint** (`bun run lint`, i.e. `oxlint --deny-warnings src`). Warnings fail, so unused imports and vars block the gate.
  - Markdown: **markdownlint-cli2** (`bun run lint:md`) covers every tracked `.md`, including `.agents/skills/`. `MD060` wants table pipes aligned to the widest cell, which `--fix` cannot do when a row is wider than the header; realign the whole table instead of narrowing the row.
  - `bun run check` runs all three. It must exit 0 before you call a task done.
- **TypeScript Settings**: `tsconfig.json` runs in strict resolution mode. Make sure all imports use clean extensions.
- **Git Hygiene**: Showcase entries live under `src/creations/<id>/`; registry metadata lives in `src/registry.ts`, not `src/main.ts` (which only bootstraps the `Scene` and wires the UI components together).

---

## ✍️ Adding a New Showcase Entry

1. Create `src/creations/<id>/index.ts`, default-exporting a class that extends `Entity` from `@vectojs/core` (`isPointInside`, `render`, and — if animated — `update`, calling `super.update(dt, time)`).
2. Register it in `CREATIONS` in `src/registry.ts`: `id`, `title`, `description`, `tags`, and a lazy `load: () => import("./creations/<id>")` thunk.
3. `bun run check && bun test && bun run build` must all pass.

### 🎨 Creation theme contract (required for every new demo)

The catalog chrome is warm-white; an open creation runs on a **Stage** backdrop
that defaults to a warm near-black (`#170f09`, with soft coral/peach corner
blooms echoing the catalog background — see `src/ui/Stage.ts`). To keep new
demos looking intentional:

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
- **Use the packages, do not reimplement them.** A demo that hand-rolls what a
  `@vectojs/*` package already does will be slower than the package and will
  silently stop receiving its optimizations. Two real examples from this repo,
  both since deleted: a 593-line `Markdown` subclass that ran its own lexer
  worker and called the private `updateTokens()` **without** the `matchLen` its
  own worker had computed — forcing an O(N) main-thread rescan of every token per
  chunk and opting out of every reconciler reuse path — and a 563-line
  hand-rolled Canvas2D line-wrapper for plain text, replaced by feeding the text
  to `Markdown` (plain text is valid Markdown).
- **Streaming text goes through `createStream()`**, not a manual
  `setContent()`/`appendMarkdown()` loop. It coalesces writes per frame, takes
  `incompleteMode: 'optimistic'` so a half-typed `**bold` does not flicker as
  literal asterisks, and reports settled blocks via `onStable`. Its `pacing` is
  fixed at construction with no pause, so a demo that needs play/pause keeps its
  own ticker and writes the revealed slice each tick. Use `destroy()` to throw a
  document away and `close()` only when you actually want end-of-stream
  settlement — `close()` on a discarded document races the next writer.
- **Keep dependency pins current.** Creations pin `@vectojs/*` versions in
  `package.json`; a stale pin means the demo shows off an old runtime. Check
  against the versions published from the `vectojs` monorepo before optimizing
  anything by hand, because the win is often already upstream.
- **Never hardcode a frame budget.** `16.67` / 60fps is wrong on this hardware
  (the dev display runs at 240Hz). Measure the refresh rate at runtime and
  report it alongside any per-frame number.
