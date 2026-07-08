---
name: vectojs-performance
description: Use when diagnosing or optimizing VectoJS performance, frame drops, layout/text cost, high entity counts, compute-heavy workloads, WebGL/WebGPU backend choices, virtualization, memory leaks, or benchmark methodology.
---

# VectoJS Performance

Use this skill when VectoJS feels slow or when designing workloads that may exceed DOM or Canvas 2D limits.

## Diagnosis workflow

1. Separate render cost, layout/text cost, application compute, event/hit-test cost, and DOM semantic-sync cost.
2. Reproduce with a fixed workload and record entity count, text length, backend, viewport, DPR, hardware, and browser.
3. Check whether CPU compute dominates before changing renderer backends.
4. Reduce unnecessary work: on-demand rendering, viewport culling, virtualization, prepared text, and dirty-region discipline.
5. Choose GPU paths only for matching workloads: WebGL point batching for large points/rects, WebGPU particles for compute-driven simulations.
6. Verify with the same benchmark after each change.

Read `references/performance-checklist.md` for concrete probes and fixes.

## Decision matrix

| Symptom                       | Likely area    | First fix                                                                |
| ----------------------------- | -------------- | ------------------------------------------------------------------------ |
| Idle page uses CPU            | render loop    | `scene.renderMode = 'onDemand'`, auto-throttle, avoid timers             |
| Resize or stream stalls       | layout/text    | hot width/content APIs, incremental append, debounce app compute         |
| Many rows/items slow          | entity count   | `VirtualList`, culling, aggregate decorative shapes                      |
| Pointer feels delayed         | hit-test/event | spatial hash boundaries, fewer overlapping interactive nodes             |
| 100k points slow              | renderer       | WebGL point backend if draw cost dominates                               |
| Particle simulation slow      | compute        | WebGPU only if compute is parallel and supported                         |
| Memory grows after navigation | lifecycle      | `scene.destroy()`, remove observers/timers, dispose adapters/export jobs |
| Animation steps/stutters only when the page is otherwise idle | throttle visibility | The entity animates from `update()` without overriding `hasPendingAnimations()` — the idle throttle can't see it. Use `setTransition`/`springTo`, or override it. |
| MSDF text slow / wrong glyphs with two fonts | GL text path | On core ≤ 0.2.5 the atlas re-uploads every frame and one atlas slot is shared (a second font corrupts glyphs) — fixed in core 0.2.6; on old versions keep one MSDF font per scene. |
| `@vectojs/three` slows down as entity count grows | renderer flush | On three ≤ 0.1.3 every Scene flush was a full GL render → O(N²)/frame. Fixed in three 0.1.4 (single `present()` render). |

## Compute greater than render

When calculation cost exceeds drawing cost, do not optimize the renderer first. Move expensive calculations out of per-frame paths, cache prepared results, split work across frames, use typed arrays, or move simulation to a Worker/WebGPU path when the data shape fits.

## Verification

Use production-like builds and record exact commands. In the VectoJS monorepo:

```bash
bun run benchmark
bun run compare:dom
bun run compare
```

Treat demo entity counts as workload examples, not universal promises.

**Measure on a real GPU.** Headless Chromium rasterizes in software — its FPS
numbers are a hard floor, not a measurement. Quote numbers captured in-page on
real hardware (the demos' "Export report" button), and record DPR: headless
defaults to DPR 1 while most dev machines are HiDPI, which also hides
hit-testing offsets that only appear at `deviceScaleFactor: 2`.
