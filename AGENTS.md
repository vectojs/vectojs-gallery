# VectoJS Creative Gallery Agent Guide 🤖

Welcome to the **VectoJS Creative Gallery** repository! This guide provides specialized context, architecture maps, and constraints for AI Coding Agents (such as Gemini, Claude, or Copilot) working in this codebase.

---

## 🌲 Architecture Map

This website is a **VectoJS Native Canvas Application** (no Astro, React, or standard HTML/CSS templates). The entire UI layout (sidebar, button lists, text, divider line) and showcase creations are rendered procedurally on a single full-screen canvas.

- **`/index.html`**: Entry point containing a single `<canvas id="gallery-canvas">` and importing `/src/main.ts`.
- **`/src/main.ts`**: Core application script. Initializes the VectoJS `Scene`, sets up the side-by-side screen layout using `@vectojs/ui` `Stack` and `Button` controls, and mounts/unmounts creations dynamically.
- **`/src/creations/`**: The sandboxed directory where all community submissions go.
- **`/src/creations/math-art.ts`**: Reference showcase creation demonstrating the `Entity` interface.

---

## 🛠️ Tooling & Standards

* **Package Manager**: Bun is preferred (`bun install`, `bun run dev`, `bun run build`). NPM is also supported as a fallback.
* **Linter & Formatter**:
  * Formatter: **Prettier** is strictly enforced (`prettier --write .`).
  * Linter: **Oxlint** (`oxlint`) is used for extreme performance static analysis.
* **TypeScript Settings**: `tsconfig.json` runs in strict resolution mode. Make sure all imports use clean extensions.
* **Git Hygiene**: Do not modify files outside of `src/creations/` unless explicitly requested (e.g. adding metadata to the `CREATIONS` list in `src/main.ts`).

---

## ✍️ Creation Contribution Flow

To implement a new creation, follow these instructions:

1. **Add Creation File**: Create a TypeScript file under `src/creations/[developer-name]/[creation-name].ts` (or simply `src/creations/[creation-name].ts`).
2. **Implement Entity Subclass**:
   - Make sure your class extends `Entity` from `@vectojs/core`.
   - Implement the abstract method `isPointInside(globalX: number, globalY: number): boolean` (return `false` if non-interactive).
   - Implement the `render(r: IRenderer): void` method using the `IRenderer` canvas-independent drawing API.
   - Implement the `update(dt: number, time: number): void` method for animations, calling `super.update(dt, time)`.
3. **Registry Registration**:
   - Open `src/main.ts`.
   - Import your new class.
   - Register the metadata (id, title, author, description, and entityClass) in the `CREATIONS` registry array.
4. **Validation**:
   - Format changed files: `prettier --write [files]`
   - Verify build: `bun run build`

---

## 🚨 Guidelines for AI Agents

* **Read first**: Always inspect `src/main.ts` and `src/creations/` before starting code changes.
* **Strict Sandbox**: Keep your files inside `src/creations/`. Never modify bundler configurations or `.github/` workflows unless instructed by the user.
* **Verify Builds**: Before completing your task, run `bun run build` locally and ensure 0 TypeScript compilation errors or linter warnings.
