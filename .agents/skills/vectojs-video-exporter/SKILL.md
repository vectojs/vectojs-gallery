---
name: vectojs-video-exporter
description: Use when exporting VectoJS scenes to H.264 MP4 with @vectojs/video-exporter, CLI/API capture, fixed-step scene contracts, Chromium, FFmpeg, cancellation, cleanup, or deterministic animation rendering.
---

# VectoJS Video Exporter

Use this skill to export VectoJS canvas scenes to deterministic MP4 files through Chromium and FFmpeg.

## Export workflow

1. Confirm `ffmpeg` with `libx264` is on `PATH`.
2. Confirm Chromium resolution: `PUPPETEER_EXECUTABLE_PATH`, system Chromium, or Puppeteer’s browser.
3. Ensure the rendered page exposes `window.vectoScene` with callable `stop()` and `step(dt)`.
4. Keep animations deterministic: use `Scene.step(dt)`, seeded randomness, and no wall-clock/network dependence.
5. Choose local module or hosted URL input.
6. Use cancellation with `AbortController` for API calls or signals for CLI jobs.
7. Verify the output frame count and existing-file preservation on failure when release quality matters.

Read `references/export-recipes.md` for CLI/API snippets.

## Current 0.2 contract

- CLI binary: `vecto-export`.
- API: `exportVideo(options)`.
- First page `<canvas>` is resized and captured.
- Output is H.264 MP4 with `yuv420p`.
- Frame count is `Math.ceil(fps * duration)`.
- Failed or aborted exports preserve an existing destination and remove incomplete staged files.
- SIGINT/SIGTERM clean up Chromium, Vite, FFmpeg, progress output, and staged files.
- Capture runs at `deviceScaleFactor: 1` — output resolution equals `width`×`height`
  exactly, independent of the host machine's DPR.
- The exporter calls `scene.stop()` itself, then drives `step(dt)` per frame;
  the page only needs to expose the scene, not manage the loop. `step()` uses
  the Scene's main renderer, so particle simulations advance deterministically.

## Sandbox policy

Keep Chromium sandboxing enabled for normal users. It is disabled only when running as root or when `VECTO_CHROMIUM_NO_SANDBOX=1` is explicitly set. Prefer a non-root export process.

## Common mistakes

| Mistake                                 | Correction                                                                |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Forgetting `window.vectoScene`          | Expose the Scene after adding entities and before starting export.        |
| Using wall-clock animation              | Drive state from `step(dt)` time or seeded simulation state.              |
| Publishing helper HTML into source dirs | Use local module input; exporter serves it through in-memory Vite HTML.   |
| Killing the process without cleanup     | Use AbortController or process signals and wait for cleanup.              |
| Assuming browser export works on CI     | Install FFmpeg and Chromium; set `PUPPETEER_EXECUTABLE_PATH` when needed. |
