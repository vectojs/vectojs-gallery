<!--
Thanks for showcasing your work! Fill in the sections below — see CONTRIBUTING.md
for the full guidelines if anything here is unclear.
-->

## What is this?

<!-- One or two sentences: what does your creation do / show off? -->

## Preview

<!--
Required. Attach a short screen recording (GIF or video) or a screenshot of your
creation running. Drag the file into this text box on GitHub to embed it — this
is how reviewers evaluate your PR without pulling the branch locally.
-->

## Checklist

- [ ] My creation lives entirely in one new file under `src/creations/` (or `src/creations/<my-name>/` if it needs helper files) — I have not modified any other creator's files.
- [ ] My `Entity` subclass implements `isPointInside`, `render`, and (if animated) `update`, and sizes itself from `this.width`/`this.height` rather than hardcoded pixels, so it's responsive.
- [ ] I only imported from `@vectojs/core`, `@vectojs/ui`, `@vectojs/three`, and `three` — no other runtime dependencies.
- [ ] I registered my creation in the `CREATIONS` array in `src/main.ts`, including an `author` field with **a link to my GitHub profile** (or another profile you're comfortable being credited under).
- [ ] `bun run build` and `bun run lint` both pass locally with no errors.
- [ ] I have not modified `.github/`, bundler config, or any file outside `src/creations/` and my own `CREATIONS` entry.

## Anything reviewers should know?

<!-- Optional: known limitations, browser/GPU requirements, inspiration/credits, etc. -->
