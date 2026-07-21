/**
 * StreamReader — a Markdown & EPUB streaming reader, ported from the
 * vectojs-playground `stream-page` prototype into the Gallery's one-Entity-
 * per-creation contract. Drop or pick a .txt/.md/.epub file and it streams
 * character-by-character at an adjustable rate, exercising VectoJS's
 * incremental text layout (plain text) and @vectojs/ui's incremental
 * Markdown rendering (with math via MathMarkdown).
 *
 * Unlike the prototype (its own page, its own Scene, `window`-sized), this
 * is a guest inside the Gallery's one shared full-window canvas/Scene: no
 * private canvas, no own render loop — `resizeTo()`/`update()`/`destroy()`
 * plug into the same lifecycle every other creation uses, and every
 * `window`/`document`-level listener registered here is explicitly removed
 * in `destroy()` so switching creations doesn't leak them.
 */
import { Entity } from "@vectojs/core";
import type { MarkdownTheme } from "@vectojs/ui";
import {
  createStreamState,
  tickStream,
  tokenize,
  type StreamState,
} from "./state";
import { parseFile } from "./parser";
import { PerfMonitor } from "./perf";
import { StreamTextEntity } from "./StreamTextEntity";
import { ControlPanel } from "./ControlPanel";
import { PerfPanel } from "./PerfPanel";
import { DropZone } from "./DropZone";
import { MathMarkdown } from "./MathMarkdown";

const MD_THEME: MarkdownTheme = {
  textColor: "#2d2015",
  headingColor: "#1d130a",
  codeColor: "#0f172a",
  codeBgColor: "rgba(0,0,0,0.04)",
  quoteBorderColor: "#b4823c",
  quoteTextColor: "#8c7a65",
  tableBgColor: "rgba(0, 0, 0, 0.02)",
  tableHeaderBgColor: "rgba(0, 0, 0, 0.06)",
  bodyFont: "system-ui, sans-serif",
  codeFont: "monospace",
  fontSize: 15,
};

const PERF_W = 190;
const PERF_H = 98;
const PERF_PAD = 12;
// The shared gallery shell floats a FullscreenChip in the top-right corner of
// the workspace (main.ts: x = innerWidth - 34 - 16, y = 16, 34px square →
// bottom edge at 50). The perf panel is also top-right-anchored, so its first
// row (FPS) rendered right under that chip. Drop the panel below the chip band
// so the two overlays never overlap. Keep in sync if the chip moves.
const PERF_TOP = 56;

// A plain function parameter always gets its declared type, not whatever
// narrowing the caller's control flow had applied — needed below because
// `tickStream()` can flip `state.status` to "done" from inside a block
// where TS had already narrowed it to the literal "streaming".
function isDone(status: StreamState["status"]): boolean {
  return status === "done";
}

class StreamReader extends Entity {
  private state: StreamState;
  private perf = new PerfMonitor();
  private streamText: StreamTextEntity;
  private markdownView: MathMarkdown;
  private controlPanel: ControlPanel;
  private perfPanel: PerfPanel;
  private dropZone: DropZone;
  private canvasEl: HTMLCanvasElement | null;

  private mdScrollY = 0;
  private mdAutoScroll = true;
  private mdPushedText = "";
  // Set once the post-stream calibration `setContent` rebuild has run for the
  // current document — distinct from `mdPushedText`, which already equals
  // `state.visible` by the time `finished` goes true on the same tick (see
  // update()), so comparing against it can never detect "not yet calibrated".
  private mdCalibrated = false;
  private lastPerfUpdate = 0;
  private mdDragging = false;
  private mdDragY = 0;

  constructor() {
    super("StreamReader");
    this.state = createStreamState();
    this.canvasEl = document.getElementById(
      "gallery-canvas",
    ) as HTMLCanvasElement | null;

    this.streamText = new StreamTextEntity({
      font: '15px/1.7 "JetBrains Mono", "Fira Mono", "Consolas", monospace',
      color: "#2d2015",
      lineHeight: 26,
      padding: 40,
    });

    this.controlPanel = new ControlPanel({
      onFileOpen: () => this.openFilePicker(),
      onPlay: () => {
        if (this.state.content && this.state.status !== "streaming") {
          this.state.status = "streaming";
          this.layout();
          this.scene?.markDirty();
        }
      },
      onPause: () => {
        if (this.state.status === "streaming") {
          this.state.status = "paused";
          this.scene?.markDirty();
        }
      },
      onStop: () => this.stopAndClear(),
      onToggleLoop: () => {
        this.state.loop = !this.state.loop;
        this.scene?.markDirty();
      },
      onRateChange: (r: number) => {
        this.state.tokenRate = r;
        this.controlPanel.syncRate(r);
        this.scene?.markDirty();
      },
    });

    this.perfPanel = new PerfPanel();
    this.dropZone = new DropZone(() => this.openFilePicker());

    // maxWidth is a placeholder — the entity's real width is 0 until the
    // shell's first resizeTo() call; layout() sets the real value (and only
    // then populates content) once it's known, same fix as the portfolio
    // hub's chat-column bug (2026-07-18-gallery-hub-polish).
    this.markdownView = new MathMarkdown("", {
      maxWidth: 800,
      theme: MD_THEME,
      onLinkClick: (url) => window.open(url, "_blank"),
    });
    this.setMarkdownShown(false);

    // VectoJS paints children in add() order (later = on top). DropZone's
    // own doc comment says it's "hidden once a file is loaded" — i.e. it
    // needs to be the TOPMOST layer while idle, covering streamText's own
    // always-opaque background. Added last (but before the chrome panels,
    // which must stay usable even while the drop zone shows).
    this.add(this.streamText);
    this.add(this.markdownView);
    this.add(this.dropZone);
    this.add(this.controlPanel);
    this.add(this.perfPanel);

    document.addEventListener("dragover", this.onDragOver);
    document.addEventListener("drop", this.onDrop);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("pointerdown", this.onWindowPointerDown);
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layout();
  }

  private markdownMaxScroll(viewportH: number): number {
    return Math.max(0, this.markdownView.height + 64 - viewportH);
  }

  /**
   * Hide via opacity + park off-screen so AABB hit-testing cannot steal
   * events — Markdown is a @vectojs/ui component without a `visible` flag.
   */
  private setMarkdownShown(shown: boolean): void {
    this.markdownView.opacity = shown ? 1 : 0;
    this.markdownView.interactive = shown;
    if (!shown) {
      this.markdownView.x = -1e6;
      this.markdownView.y = -1e6;
    }
  }

  private layout(): void {
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;
    const ctrlH = this.controlPanel.panelHeight;

    this.dropZone.x = 0;
    this.dropZone.y = 0;
    this.dropZone.width = w;
    this.dropZone.height = h;

    this.streamText.x = 0;
    this.streamText.y = 0;
    this.streamText.width = w;
    this.streamText.height = h - ctrlH;

    // Idle always uses StreamText for the hint; markdown only while playing/paused/done.
    const useMarkdown =
      this.state.kind === "markdown" && this.state.status !== "idle";
    if (useMarkdown) {
      this.streamText.visible = false;
      this.setMarkdownShown(true);
      this.markdownView.x = 32;
      this.markdownView.y = 32 - this.mdScrollY;

      const targetW = w - 64;
      if (this.markdownView.maxWidth !== targetW) {
        this.markdownView.maxWidth = targetW;
        this.markdownView.setContent(this.state.visible);
        this.mdPushedText = this.state.visible;
        // Not `mdCalibrated = true`: this rebuild can happen mid-stream
        // (e.g. a window resize before the document finishes), and
        // `state.visible` may still grow afterward — only the completion-time
        // rebuild in update() should retire the calibration flag.
      }
    } else {
      this.streamText.visible = true;
      this.setMarkdownShown(false);
    }

    this.controlPanel.x = 0;
    this.controlPanel.y = h - ctrlH;
    this.controlPanel.width = w;
    this.controlPanel.height = ctrlH;
    this.controlPanel.state = this.state;

    this.perfPanel.x = w - PERF_W - PERF_PAD;
    this.perfPanel.y = PERF_TOP;
    this.perfPanel.width = PERF_W;
    this.perfPanel.height = PERF_H;

    this.positionRateInput();
  }

  /** Places the ControlPanel's DOM `<input>` in real CSS pixels — see ControlPanel.getInputLocalAnchor. */
  private positionRateInput(): void {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scale = rect.width / window.innerWidth;
    const g = this.getGlobalPosition();
    const anchor = this.controlPanel.getInputLocalAnchor();
    const cssLeft = rect.left + (g.x + this.controlPanel.x + anchor.x) * scale;
    const cssTop = rect.top + (g.y + this.controlPanel.y + anchor.y) * scale;
    this.controlPanel.positionInput(cssLeft, cssTop);
  }

  private openFilePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.epub,.html,.htm,.csv,.json,.log";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.loadFile(file);
    };
    input.click();
  }

  private async loadFile(file: File): Promise<void> {
    this.streamText.visible = true;
    this.streamText.idleHint = `⏳ Parsing ${file.name} …`;
    this.streamText.visibleText = "";
    this.streamText.resetScroll();
    this.setMarkdownShown(false);
    this.scene?.markDirty();

    const parsed = await parseFile(file);

    this.state.content = parsed.plainText;
    this.state.kind = parsed.kind;
    this.state.tokens = tokenize(parsed.plainText);
    this.state.fileName = file.name;
    this.state.cursor = 0;
    this.state.visible = "";
    this.state.accumulator = 0;

    this.mdScrollY = 0;
    this.mdAutoScroll = true;
    this.mdPushedText = "";
    this.mdCalibrated = false;
    this.markdownView.setContent("");

    this.state.status = "streaming"; // auto-start

    this.streamText.visibleText = "";
    this.streamText.idleHint = "";
    this.streamText.resetScroll();
    this.dropZone.visible = false;

    this.layout();
    this.scene?.markDirty();
  }

  private stopAndClear(): void {
    this.state.status = "idle";
    this.state.cursor = 0;
    this.state.visible = "";
    this.state.accumulator = 0;
    this.streamText.visibleText = "";
    this.streamText.resetScroll();
    this.streamText.idleHint = this.state.fileName
      ? `${this.state.fileName} — Press ▶ Play to start`
      : "";

    this.mdScrollY = 0;
    this.mdAutoScroll = true;
    this.mdPushedText = "";
    this.mdCalibrated = false;
    this.markdownView.setContent("");

    this.layout();
    this.scene?.markDirty();
  }

  override isPointInside(): boolean {
    return false;
  }

  // `continuousRedraw: false` (registry.ts) switches the shared Scene to
  // `renderMode: 'onDemand'` while this creation is mounted (see
  // main.ts) — it skips the entire update/render walk once idle (no dirty
  // flag, no pending animation). Active streaming only re-marks the scene
  // dirty from INSIDE update() (below, when tickStream adds new
  // characters) — if update() itself stops being called because a single
  // tick happened to add zero characters (accumulator hadn't crossed a
  // full token yet) while nothing else was marking the scene dirty, that
  // silence is self-perpetuating: no update() call means no chance to
  // mark dirty again, so the stream can stall completely until some
  // unrelated interaction nudges the scene awake. Without this override
  // (the default reports "not animating"), core has no way to know
  // streaming is still in flight. See forge/findings.md 2026-07-19
  // ("FPS drops lower and lower as more EPUBs are loaded" — the real
  // cause was streaming silently stalling, not the frame rate itself).
  override hasPendingAnimations(): boolean {
    return this.state.status === "streaming";
  }

  override render(): void {
    /* everything here is a child entity (streamText/markdownView/panels) — nothing to draw directly */
  }

  override update(_dt: number): void {
    const now = performance.now();
    const sample = this.perf.tick(now);
    if (now - this.lastPerfUpdate > 1000) {
      this.perfPanel.sample = sample;
      this.lastPerfUpdate = now;
      this.scene?.markDirty();
    }

    if (this.state.status !== "streaming") {
      this.controlPanel.state = this.state;
      this.controlPanel.syncRate(this.state.tokenRate);
      return;
    }

    const addedCount = tickStream(this.state, _dt);

    if (this.state.kind === "markdown") {
      this.streamText.visibleText = ""; // clear raw text to avoid overlap

      const newlyAdded = this.state.visible.slice(this.mdPushedText.length);
      const finished =
        isDone(this.state.status) ||
        this.state.cursor >= this.state.tokens.length;

      // No time-merge throttle — appends whenever a frame has new
      // characters, so the text "types out" smoothly at any frame rate.
      if (newlyAdded) {
        this.markdownView.appendMarkdown(newlyAdded);
        this.mdPushedText = this.state.visible;

        if (this.mdAutoScroll) {
          const h = this.height - this.controlPanel.panelHeight;
          this.mdScrollY = this.markdownMaxScroll(h);
          this.markdownView.y = 32 - this.mdScrollY;
        }
      }

      if (finished && !this.mdCalibrated) {
        // One calibration rebuild right as streaming ends, but ONLY when the
        // document actually contains math/image content that could have been
        // left stale by @vectojs/ui's incremental `updateTokens` fast path
        // (a paragraph that completed an `inlineMath`/`image` run mid-stream
        // then became non-last before `reconcileLastMixedParagraph` swapped
        // it). A full `setContent` re-lexes and re-shapes every block in one
        // frame — the single worst streaming-completion hitch (~700ms+ on a
        // large doc, real-GPU) — so skipping it for plain text/code documents
        // (which have nothing to correct) removes that hitch entirely. See
        // forge/findings.md 2026-07-18 / 2026-07-20.
        if (this.markdownView.needsCalibration()) {
          this.markdownView.setContent(this.state.visible);
        }
        this.mdPushedText = this.state.visible;
        this.mdCalibrated = true;
      }
    } else if (addedCount > 0) {
      this.streamText.visibleText = this.state.visible;
    }

    if (addedCount > 0 || this.state.cursor >= this.state.tokens.length) {
      this.scene?.markDirty();
    }

    this.controlPanel.state = this.state;
    this.controlPanel.syncRate(this.state.tokenRate);
  }

  override destroy(): void {
    document.removeEventListener("dragover", this.onDragOver);
    document.removeEventListener("drop", this.onDrop);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerdown", this.onWindowPointerDown);
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    window.removeEventListener("pointerup", this.onWindowPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    // ControlPanel owns a real DOM <input> — its own destroy() removes it.
    // Entity.destroy() doesn't cascade to children (see Nexus/Dimension for
    // the same reasoning), so this has to happen explicitly.
    this.controlPanel.destroy();
    super.destroy();
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  private readonly onDragOver = (e: DragEvent): void => {
    e.preventDefault();
  };

  private readonly onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void this.loadFile(file);
  };

  // ── Markdown scroll (wheel + touch drag) ────────────────────────────────────

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.state.kind !== "markdown") return;
    const dy = e.deltaY;
    const oldY = this.mdScrollY;
    this.mdScrollY += dy;
    const h = this.height - this.controlPanel.panelHeight;
    const maxScroll = this.markdownMaxScroll(h);
    this.mdScrollY = Math.max(0, Math.min(maxScroll, this.mdScrollY));
    if (this.mdScrollY < maxScroll - 8) this.mdAutoScroll = false;
    if (this.mdScrollY !== oldY) {
      this.markdownView.y = 32 - this.mdScrollY;
      this.scene?.markDirty();
    }
  };

  private readonly onWindowPointerDown = (e: PointerEvent): void => {
    if (this.state.kind !== "markdown") return;
    if (e.pointerType === "touch") {
      this.mdDragging = true;
      this.mdDragY = e.clientY;
    }
  };

  private readonly onWindowPointerMove = (e: PointerEvent): void => {
    if (!this.mdDragging || this.state.kind !== "markdown") return;
    const dy = this.mdDragY - e.clientY;
    this.mdDragY = e.clientY;
    const oldY = this.mdScrollY;
    this.mdScrollY += dy;
    const h = this.height - this.controlPanel.panelHeight;
    const maxScroll = this.markdownMaxScroll(h);
    this.mdScrollY = Math.max(0, Math.min(maxScroll, this.mdScrollY));
    if (this.mdScrollY < maxScroll - 8) this.mdAutoScroll = false;
    if (this.mdScrollY !== oldY) {
      this.markdownView.y = 32 - this.mdScrollY;
      this.scene?.markDirty();
    }
  };

  private readonly onWindowPointerUp = (): void => {
    this.mdDragging = false;
  };

  // ── Keyboard shortcuts: Space = play/pause, Esc = stop, L = toggle loop ────

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      if (this.state.status === "streaming") {
        this.state.status = "paused";
      } else if (this.state.content) {
        this.state.status = "streaming";
        this.layout();
      }
      this.scene?.markDirty();
    }
    if (e.code === "Escape") {
      this.stopAndClear();
    }
    if (e.code === "KeyL") {
      this.state.loop = !this.state.loop;
      this.scene?.markDirty();
    }
  };
}

export default StreamReader;
