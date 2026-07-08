# Contributing to the VectoJS Gallery

The gallery is a community showcase: every creation is a self-contained VectoJS
`Entity` submitted as a pull request. This doc is the single source of truth for
the rules — the PR template and the in-app "Submission Guidelines" panel both
point back here.

## Submission steps

1. **Fork and branch** from `main`.
2. **Write your creation** as one file under `src/creations/` (or
   `src/creations/<your-name>/` if it needs helper files):

   ```typescript
   import { Entity, type IRenderer } from "@vectojs/core";

   export default class MyCreation extends Entity {
     constructor() {
       super("MyCreation");
     }

     override isPointInside(_x: number, _y: number): boolean {
       return false; // true + real hit-testing if your piece is interactive
     }

     override update(dt: number, time: number): void {
       super.update(dt, time);
       // animate here
     }

     override render(r: IRenderer): void {
       // draw here — use this.width / this.height, not hardcoded pixels
     }
   }
   ```

3. **Register it** in the `CREATIONS` array in `src/main.ts`, with an `author`
   field linking your GitHub profile (or another profile you're comfortable
   being credited under — see [Attribution](#attribution)).
4. **Verify locally**: `bun run build` and `bun run lint` must both pass with
   no errors before you open the PR.
5. **Open the PR** using the template — it has a checklist covering the same
   rules as this doc, plus a required preview GIF/screenshot so reviewers can
   evaluate your work without pulling the branch.

## Rules

- **VectoJS only.** Import only from `@vectojs/core`, `@vectojs/ui`,
  `@vectojs/three`, and `three`. No other runtime dependencies, no raw
  `CanvasRenderingContext2D` access — draw everything through the `IRenderer`
  interface passed to `render()`.
- **No network access.** Your creation runs in every visitor's browser. Don't
  call `fetch`/`XMLHttpRequest`/`WebSocket`, don't load external images, fonts,
  or scripts, and don't read `document.cookie` or `localStorage`. Everything
  your piece needs should be generated procedurally or bundled as a local
  asset in your own `src/creations/` subfolder.
- **Stay in your sandbox.** Don't modify any file outside `src/creations/`
  except your own entry in the `CREATIONS` array in `src/main.ts`. This is
  what keeps unrelated PRs from conflicting with each other.
- **Responsive by construction.** Read `this.width` / `this.height` in
  `render()` rather than hardcoding pixel values, so your piece works at any
  window size.
- **Keep it civil.** No offensive, misleading, or harassing content. This is a
  public gallery linked from the VectoJS homepage.

## Attribution

Every entry's `author` field must include a link to a profile you're
comfortable being publicly credited under — typically your GitHub profile,
but a personal site or another social profile is fine too. This is how
credit works instead of a separate authors file, and it's also how people
discovering a piece they like can find more of your work.

## Review process

A maintainer reviews every PR for the checklist above, then merges to `main`,
which auto-deploys to [gallery.vectojs.org](https://gallery.vectojs.org) via
GitHub Actions — no separate release step. Turnaround depends on maintainer
availability; feel free to ping the PR after a few days if it's gone quiet.

## License

By submitting a pull request, you agree your contribution is licensed under
this repository's [MIT license](./LICENSE), same as the rest of the codebase.
