/**
 * StreamReader — a Markdown streaming reader, exercising
 * `@vectojs/markdown`'s own incremental streaming path.
 *
 * Drop or pick a `.md`/`.txt` file and it reveals the source at an adjustable
 * rate, one tokenizer unit at a time, the way an LLM response arrives.
 *
 * This creation is a guest inside the Gallery's one shared full-window
 * canvas/Scene: no private canvas, no own render loop — `resizeTo()`,
 * `update()`, and `destroy()` plug into the same lifecycle every other
 * creation uses, and every `window`/`document`-level listener registered here
 * is explicitly removed in `destroy()` so switching creations doesn't leak
 * them.
 *
 * ## Why there is no custom Markdown subclass here any more
 *
 * This creation used to ship a 593-line `MathMarkdown` subclass plus its own
 * lexing Worker and `marked` math extensions. All three existed to work around
 * gaps that `@vectojs/markdown` has since closed (0.6.0): inline `$…$` is
 * typeset natively, a math fence defers conversion until it closes and
 * memoizes the result, and MathJax loads on demand. The subclass also reached
 * into the library's private `updateTokens()` and called it *without* the
 * `matchLen` its own worker had just computed, forcing a full main-thread
 * re-scan of every token's `raw` string on every streamed chunk — and, by
 * bypassing `appendMarkdownCore`, it opted out of every reconciler reuse path
 * the library added (lists were Θ(N²), headings and blockquotes were rebuilt
 * per chunk).
 *
 * The fix is to stop reimplementing the streaming path: `createStream()` owns
 * buffering and per-frame coalescing, and `write()` goes through the same
 * reconciler as a one-shot parse.
 */
import { Entity } from '@vectojs/core';
import { Markdown, type MarkdownTheme, type StreamController } from '@vectojs/markdown';
import { createStreamState, rewindStream, tickStream, tokenize, type StreamState } from './state';
import { ACCEPTED_EXTENSIONS, isAcceptedFile, loadFile } from './parser';
import { PerfMonitor } from './perf';
import { ControlPanel } from './ControlPanel';
import { PerfPanel } from './PerfPanel';
import { DropZone } from './DropZone';
import { ScrollBar, SCROLLBAR_HIT_BAND } from './ScrollBar';

const MD_THEME: MarkdownTheme = {
  textColor: '#2d2015',
  headingColor: '#1d130a',
  codeColor: '#0f172a',
  codeBgColor: 'rgba(0,0,0,0.04)',
  quoteBorderColor: '#b4823c',
  quoteTextColor: '#8c7a65',
  tableBgColor: 'rgba(0, 0, 0, 0.02)',
  tableHeaderBgColor: 'rgba(0, 0, 0, 0.06)',
  bodyFont: 'system-ui, sans-serif',
  codeFont: 'monospace',
  fontSize: 15,
};

const PERF_W = 190;
const PERF_H = 98;
const PERF_PAD = 12;
// Top margin for the top-right-anchored perf panel, matching the back chip's
// top inset (y = 16) so the two top-anchored overlays sit on the same band.
const PERF_TOP = 16;
// How often the panel re-reads the scene's telemetry. The engine measures every
// frame; this only throttles how often those numbers are copied onto the panel,
// so the text stays readable instead of flickering at the display rate.
const PERF_REFRESH_MS = 500;

// A plain function parameter always gets its declared type, not whatever
// narrowing the caller's control flow had applied — needed below because
// `tickStream()` can flip `state.status` to 'done' from inside a block where TS
// has already narrowed it to the literal 'streaming'.
function isDone(status: StreamState['status']): boolean {
  return status === 'done';
}

/**
 * Floor for the stream's admission buffer, used when the document is smaller
 * than it. Matches the controller's own 64KiB default so a small file behaves
 * exactly as before this was set explicitly.
 */
const MIN_BUFFERED_CHARS = 64 * 1024;

/** Left/top inset of the document inside the content viewport. */
const DOC_INSET = 32;
/** Extra scrollable slack below the document so the last line clears the panel. */
const DOC_TAIL = 64;

class StreamReader extends Entity {
  private state: StreamState;
  private perf = new PerfMonitor();
  private markdownView: Markdown;
  private controlPanel: ControlPanel;
  private perfPanel: PerfPanel;
  private dropZone: DropZone;
  private scrollBar: ScrollBar;
  private canvasEl: HTMLCanvasElement | null;

  /**
   * The library's writer for the current document, or `null` when nothing is
   * loaded. Recreated per document (and per loop pass) because a controller is
   * single-use: `close()` settles it, and it cannot rewind.
   */
  private stream: StreamController | null = null;

  private mdScrollY = 0;
  private mdAutoScroll = true;
  private lastPerfUpdate = 0;
  private mdDragging = false;
  private mdDragY = 0;
  // Scrollbar-thumb drag (mouse or touch), tracked at window level.
  private thumbDragging = false;
  private thumbStartClientY = 0;
  private thumbStartScroll = 0;

  constructor() {
    super('StreamReader');
    this.state = createStreamState();
    this.canvasEl = document.getElementById('gallery-canvas') as HTMLCanvasElement | null;

    this.controlPanel = new ControlPanel({
      onFileOpen: () => this.openFilePicker(),
      onPlay: () => {
        if (this.state.content && this.state.status !== 'streaming') {
          this.state.status = 'streaming';
          this.layout();
          this.scene?.markDirty();
        }
      },
      onPause: () => {
        if (this.state.status === 'streaming') {
          this.state.status = 'paused';
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

    this.scrollBar = new ScrollBar();
    // The bar is a pure visual; it reads live scroll geometry each render. Thumb
    // hit-testing + dragging live in the window pointer handlers below (the bar
    // is non-interactive so it never blocks the document's text selection).
    this.scrollBar.metrics = () => ({
      viewH: this.height - this.controlPanel.panelHeight,
      contentH: this.markdownView.height + DOC_TAIL,
      scrollY: this.mdScrollY,
    });

    // maxWidth is a placeholder — the entity's real width is 0 until the
    // shell's first resizeTo() call; layout() sets the real value once it is
    // known.
    this.markdownView = new Markdown('', {
      maxWidth: 800,
      theme: MD_THEME,
      onLinkClick: (url) => window.open(url, '_blank'),
    });
    this.setMarkdownShown(false);

    this.add(this.markdownView);
    this.add(this.scrollBar); // over the document, under the chrome/drop layers
    this.add(this.dropZone);
    this.add(this.controlPanel);
    this.add(this.perfPanel);

    document.addEventListener('dragover', this.onDragOver);
    document.addEventListener('drop', this.onDrop);
    document.addEventListener('dragstart', this.onDragStart);
    document.addEventListener('dragend', this.onDragEnd);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('pointerdown', this.onWindowPointerDown);
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layout();
  }

  private markdownMaxScroll(viewportH: number): number {
    return Math.max(0, this.markdownView.height + DOC_TAIL - viewportH);
  }

  /**
   * Single clamp path for every scroll input (wheel, touch drag, scrollbar).
   * Clamps to `[0, maxScroll]`, drops auto-follow once scrolled off the bottom,
   * and moves the view. No-op when the offset is unchanged.
   */
  private scrollMarkdownTo(y: number): void {
    if (!this.isDocumentShown()) return;
    const h = this.height - this.controlPanel.panelHeight;
    const maxScroll = this.markdownMaxScroll(h);
    const clamped = Math.max(0, Math.min(maxScroll, y));
    if (clamped === this.mdScrollY) return;
    this.mdScrollY = clamped;
    this.mdAutoScroll = this.mdScrollY >= maxScroll - 8;
    this.markdownView.y = DOC_INSET - this.mdScrollY;
    this.scene?.markDirty();
  }

  /** True once a file is loaded and the document (not the drop hint) is on screen. */
  private isDocumentShown(): boolean {
    return this.state.status !== 'idle';
  }

  /**
   * Hit-test a window pointer against the scrollbar thumb. The bar overlays the
   * content viewport at creation-local (0,0); the creation sits at scene y=0
   * (canvas top) and the scene's logical space is 1:1 with CSS pixels, so a
   * client point maps to bar-local by subtracting the canvas rect. X is tested
   * as "within the right-edge band"; Y against the current thumb rectangle.
   */
  private pointerOnThumb(clientX: number, clientY: number): boolean {
    if (!this.canvasEl) return false;
    const band = this.scrollBar.thumbBand();
    if (!band) return false;
    const rect = this.canvasEl.getBoundingClientRect();
    if (clientX < rect.right - SCROLLBAR_HIT_BAND || clientX > rect.right) {
      return false;
    }
    const localY = clientY - rect.top;
    return localY >= band.top - 2 && localY <= band.top + band.height + 2;
  }

  /** Convert a thumb-drag distance (client px) into a scroll offset delta. */
  private thumbDragToScroll(deltaClientY: number): number {
    const band = this.scrollBar.thumbBand();
    if (!band || band.trackTravel <= 0) return this.thumbStartScroll;
    const h = this.height - this.controlPanel.panelHeight;
    const maxScroll = this.markdownMaxScroll(h);
    return this.thumbStartScroll + (deltaClientY / band.trackTravel) * maxScroll;
  }

  /**
   * Hide via opacity + park off-screen so AABB hit-testing cannot steal
   * events — Markdown is a @vectojs/ui component without a `visible` flag.
   *
   * The view is deliberately never `interactive`. An interactive entity gets an
   * a11y projection covering its whole box with `pointer-events: auto`
   * (`Scene.syncA11y`, `attrs.pointerEvents ?? 'auto'`), and this entity's box is
   * the ENTIRE document — measured 1222x46064 px at `zIndex: 14`. Since the
   * transparent text carriers are pinned at `zIndex: 0`, that blanket sat above
   * every line: `elementFromPoint` inside a real carrier returned the blanket and
   * native drag-selection could not start anywhere in the document.
   *
   * Nothing needed it. Scrolling arrives through the window-level `wheel` and
   * `pointer*` listeners installed in `mount()`, not through entity events, and
   * `onLinkClick` is dispatched by the per-block `RichText` children rather than
   * by this wrapper. Canvas hit-testing is unaffected either way: it runs against
   * the entity tree, not the DOM.
   */
  private setMarkdownShown(shown: boolean): void {
    this.markdownView.opacity = shown ? 1 : 0;
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

    if (this.isDocumentShown()) {
      this.setMarkdownShown(true);
      this.markdownView.x = DOC_INSET;
      this.markdownView.y = DOC_INSET - this.mdScrollY;

      // Scrollbar overlays the content viewport (above the control panel).
      this.scrollBar.x = 0;
      this.scrollBar.y = 0;
      this.scrollBar.width = w;
      this.scrollBar.height = h - ctrlH;
      this.scrollBar.opacity = 1;

      // Re-wrap the already-rendered blocks in place. This used to require a full
      // rebuild — release the stream, replay the revealed source through
      // `setContent`, open a fresh writer, carry the scroll offset across by hand —
      // because `maxWidth` is read when each block is *built*, so assigning it
      // alone left every existing block at the old width. `setMaxWidth`
      // (@vectojs/markdown 0.9.0) reflows the existing blocks instead: the same
      // entity instances survive, an open stream writer keeps appending, and
      // nothing is re-lexed.
      this.markdownView.setMaxWidth(w - DOC_INSET * 2);
    } else {
      this.setMarkdownShown(false);
      this.scrollBar.opacity = 0;
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_EXTENSIONS;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      // `accept` is a dialog filter, not a guarantee: "All files" defeats it in
      // every browser's picker. Same gate as the drop path.
      if (!isAcceptedFile(file)) {
        this.rejectFile(file);
        return;
      }
      void this.openFile(file);
    };
    input.click();
  }

  /**
   * Discard the current writer. `destroy()` rather than `close()`: closing is a
   * promise that also runs end-of-stream settlement, which is meaningless for a
   * document being thrown away, and it would race the next document's writer.
   */
  private releaseStream(): void {
    this.stream?.destroy();
    this.stream = null;
  }

  /**
   * Stop playback because the writer refused a chunk.
   *
   * `write()` rejects rather than blocking when a blocked write already exists,
   * so a refusal means this chunk never reached the document and the visible text
   * would silently diverge from `state.cursor` if playback continued. Halting is
   * therefore the honest outcome: the panel's status readout shows the stream is
   * no longer running, and the document keeps everything committed so far.
   */
  private failStream(error: unknown): void {
    this.releaseStream();
    this.state.status = 'done';
    console.error('[chat] stream write refused, playback stopped:', error);
    this.scene?.markDirty();
  }

  /** Point the document at a fresh empty source and open a new writer over it. */
  private resetDocument(): void {
    this.releaseStream();
    this.markdownView.setContent('');
    this.stream = this.markdownView.createStream({
      // A typewriter that shows `**bo` before the closing `**` arrives reads as
      // a rendering bug rather than as typing. The guess is display-only and is
      // unwound on close, so the finished document is identical either way.
      incompleteMode: 'optimistic',
      // `tokenize()` keeps a whole `![alt](url)` span as ONE atomic token, and a
      // `data:` URI runs to hundreds of thousands of base64 characters, so a
      // single tick can hand over a chunk far larger than the 64KiB default.
      // Admission only takes an oversize chunk when the buffer is otherwise
      // empty; if anything is already accepted-but-uncommitted it parks in the
      // single blocked slot, and a further write that frame rejects. Sizing the
      // buffer from the document itself keeps every chunk admissible without
      // guessing a ceiling: the whole source is the true upper bound on any
      // chunk, and the buffer is a character count, not a retained copy.
      maxBufferedChars: Math.max(MIN_BUFFERED_CHARS, this.state.content.length),
    });
    this.mdScrollY = 0;
    this.mdAutoScroll = true;
  }

  private async openFile(file: File): Promise<void> {
    this.dropZone.loadingLabel = `Parsing ${file.name} …`;
    this.scene?.markDirty();

    const loaded = await loadFile(file);

    this.state.content = loaded.source;
    this.state.tokens = tokenize(loaded.source);
    this.state.fileName = loaded.fileName;
    rewindStream(this.state);

    this.resetDocument();

    this.state.status = 'streaming'; // auto-start
    this.dropZone.loadingLabel = '';
    this.dropZone.visible = false;

    this.layout();
    this.scene?.markDirty();
  }

  private stopAndClear(): void {
    this.state.status = 'idle';
    rewindStream(this.state);
    this.releaseStream();
    this.markdownView.setContent('');
    this.dropZone.visible = true;
    this.dropZone.loadingLabel = '';
    this.dropZone.hint = this.state.fileName
      ? `${this.state.fileName} — Press ▶ Play to start`
      : '';

    this.mdScrollY = 0;
    this.mdAutoScroll = true;

    this.layout();
    this.scene?.markDirty();
  }

  override isPointInside(): boolean {
    return false;
  }

  // `continuousRedraw: false` (registry.ts) switches the shared Scene to
  // `renderMode: 'onDemand'` while this creation is mounted (see main.ts) — it
  // skips the entire update/render walk once idle (no dirty flag, no pending
  // animation). Active streaming only re-marks the scene dirty from INSIDE
  // update() — if update() itself stops being called because a single tick
  // happened to add zero characters (the accumulator hadn't crossed a full
  // token yet) while nothing else was marking the scene dirty, that silence is
  // self-perpetuating: no update() call means no chance to mark dirty again, so
  // the stream would stall until some unrelated interaction nudged the scene
  // awake. Without this override (the default reports "not animating"), core
  // has no way to know streaming is still in flight.
  override hasPendingAnimations(): boolean {
    return this.state.status === 'streaming';
  }

  override render(): void {
    /* everything here is a child entity (markdownView/panels) — nothing to draw directly */
  }

  override update(dt: number): void {
    const now = performance.now();
    if (this.scene && now - this.lastPerfUpdate > PERF_REFRESH_MS) {
      this.perfPanel.sample = this.perf.sample(this.scene);
      this.lastPerfUpdate = now;
      this.scene.markDirty();
    }

    if (this.state.status !== 'streaming') {
      this.controlPanel.state = this.state;
      this.controlPanel.syncRate(this.state.tokenRate);
      return;
    }

    const chunk = tickStream(this.state, dt);

    if (chunk) {
      // `write()` returns a backpressure promise, and it *rejects* rather than
      // blocking when a blocked write already exists. Its resolution is of no use
      // here — this is a fixed-rate typewriter whose next chunk is decided by the
      // frame clock, not by admission — but discarding it with `void` turns any
      // rejection into an unhandled one that escapes to the page as a
      // `pageerror`, with no way for the demo to notice.
      //
      // One write per frame does not itself reach that state: measured in
      // Chromium, the controller's own rAF commits between frames, so an oversize
      // chunk is admitted alone and no rejection occurs even with a 70 KiB image
      // token. Reproducing it took three writes inside a single frame. So this is
      // a contract the demo should honour rather than a bug it is hitting, and
      // the handler exists so that a future second write per frame surfaces here
      // instead of on `window`.
      this.stream?.write(chunk).catch((error: unknown) => {
        this.failStream(error);
      });

      if (this.mdAutoScroll) {
        const h = this.height - this.controlPanel.panelHeight;
        this.mdScrollY = this.markdownMaxScroll(h);
        this.markdownView.y = DOC_INSET - this.mdScrollY;
      }
      this.scene?.markDirty();
    }

    if (isDone(this.state.status)) {
      // Closing is what makes the document converge on a one-shot parse: it
      // final-flushes, waits for the last chunk's off-thread parse to land, and
      // unwinds the optimistic tail guess.
      const finishing = this.stream;
      this.stream = null;
      void finishing?.close().then(() => {
        if (this.state.loop && this.state.status === 'done') {
          rewindStream(this.state);
          this.resetDocument();
          this.state.status = 'streaming';
        }
        this.scene?.markDirty();
      });
      this.scene?.markDirty();
    }

    this.controlPanel.state = this.state;
    this.controlPanel.syncRate(this.state.tokenRate);
  }

  override destroy(): void {
    document.removeEventListener('dragover', this.onDragOver);
    document.removeEventListener('drop', this.onDrop);
    document.removeEventListener('dragstart', this.onDragStart);
    document.removeEventListener('dragend', this.onDragEnd);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    this.releaseStream();
    // The refresh-rate probe runs its own rAF chain, independent of the scene
    // loop, so leaving the creation has to stop it explicitly.
    this.perf.destroy();
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

  /**
   * A drag that started inside the app is never a document to open.
   *
   * The document's own rendered content is draggable DOM: a display formula
   * projects as `<img draggable="true" src="data:image/svg+xml;base64,…">`, so a
   * pointer drag across a formula — which to the user looks exactly like
   * selecting text — starts a native image drag carrying an SVG *file*. Dropping
   * it back over the reader was accepted as source and replaced the open document
   * with the text of its own rendering: data loss from a gesture that looks like
   * selection. `isAcceptedFile()` already rejects that payload on extension
   * alone; this refuses it one step earlier, because a drag originating in our own
   * UI is not a load gesture whatever it happens to carry.
   */
  private internalDrag = false;

  private readonly onDragStart = (): void => {
    this.internalDrag = true;
  };

  private readonly onDragEnd = (): void => {
    this.internalDrag = false;
  };

  private readonly onDrop = (e: DragEvent): void => {
    e.preventDefault();
    if (this.internalDrag) {
      this.internalDrag = false;
      return;
    }
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!isAcceptedFile(file)) {
      this.rejectFile(file);
      return;
    }
    void this.openFile(file);
  };

  /**
   * Refuse a dropped file without disturbing the open document.
   *
   * Says so on the drop card when that is what is on screen; otherwise the
   * document stays untouched and the console carries the reason. Refusing beats
   * guessing: a mistaken drop should never cost the user the document they were
   * reading.
   */
  private rejectFile(file: File): void {
    console.warn(`[chat] ignored "${file.name}": expected one of ${ACCEPTED_EXTENSIONS}`);
    if (this.dropZone.visible) {
      this.dropZone.hint = `${file.name} is not Markdown — expected ${ACCEPTED_EXTENSIONS}`;
      this.scene?.markDirty();
    }
  }

  // ── Scroll (wheel + touch drag) ─────────────────────────────────────────────

  private readonly onWheel = (e: WheelEvent): void => {
    this.scrollMarkdownTo(this.mdScrollY + e.deltaY);
  };

  private readonly onWindowPointerDown = (e: PointerEvent): void => {
    if (!this.isDocumentShown()) return;
    // Scrollbar-thumb grab (mouse or touch) takes priority over body drag.
    if (this.pointerOnThumb(e.clientX, e.clientY)) {
      this.thumbDragging = true;
      this.thumbStartClientY = e.clientY;
      this.thumbStartScroll = this.mdScrollY;
      this.scrollBar.dragging = true;
      this.scene?.markDirty();
      return;
    }
    if (e.pointerType === 'touch') {
      this.mdDragging = true;
      this.mdDragY = e.clientY;
    }
  };

  private readonly onWindowPointerMove = (e: PointerEvent): void => {
    if (!this.isDocumentShown()) return;
    if (this.thumbDragging) {
      this.scrollMarkdownTo(this.thumbDragToScroll(e.clientY - this.thumbStartClientY));
      return;
    }
    // Hover highlight when the pointer is over the thumb (not dragging).
    const over = this.pointerOnThumb(e.clientX, e.clientY);
    if (over !== this.scrollBar.hover) {
      this.scrollBar.hover = over;
      this.scene?.markDirty();
    }
    if (!this.mdDragging) return;
    const dy = this.mdDragY - e.clientY;
    this.mdDragY = e.clientY;
    this.scrollMarkdownTo(this.mdScrollY + dy);
  };

  private readonly onWindowPointerUp = (): void => {
    this.mdDragging = false;
    if (this.thumbDragging) {
      this.thumbDragging = false;
      this.scrollBar.dragging = false;
      this.scene?.markDirty();
    }
  };

  // ── Keyboard shortcuts: Space = play/pause, Esc = stop, L = toggle loop ────

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.state.status === 'streaming') {
        this.state.status = 'paused';
      } else if (this.state.content) {
        this.state.status = 'streaming';
        this.layout();
      }
      this.scene?.markDirty();
    }
    if (e.code === 'Escape') {
      this.stopAndClear();
    }
    if (e.code === 'KeyL') {
      this.state.loop = !this.state.loop;
      this.scene?.markDirty();
    }
  };
}

export default StreamReader;
