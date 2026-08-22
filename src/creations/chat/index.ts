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
import { Entity, Group } from '@vectojs/core';
import { Markdown, type MarkdownTheme, type StreamController } from '@vectojs/markdown';
import { createStreamState, rewindStream, tickStream, tokenize, type StreamState } from './state';
import { ACCEPTED_EXTENSIONS, isAcceptedFile, loadFile } from './parser';
import { PerfMonitor } from './perf';
import { ControlPanel } from './ControlPanel';
import { PerfPanel } from './PerfPanel';
import { DropZone } from './DropZone';
import { ScrollBar, SCROLLBAR_HIT_BAND } from './ScrollBar';
import { SearchBar } from './SearchBar';
import { collectDocumentText, findMatches, type DocText, type SearchMatch } from './search';
import type { RawRenderer } from './raw-renderer';
import { AsyncGeneration } from './async-generation';

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
const PERF_H = 128;
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

/**
 * Transient translucent bar marking the current search match's line. Lives as
 * a child of `markdownView` so it scrolls with the document; `opacity: 0` hides
 * it until a match is active.
 */
class MatchHighlight extends Entity {
  constructor() {
    super('MatchHighlight');
    this.interactive = false;
    this.opacity = 0;
  }

  override isPointInside(): boolean {
    return false;
  }

  render(renderer: RawRenderer): void {
    const ctx = renderer.ctx;
    ctx.beginPath();
    ctx.roundRect(0, 0, this.width, this.height, 4);
    ctx.fillStyle = 'rgba(255, 196, 48, 0.28)';
    ctx.fill();
  }
}

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
   * Selection regions.
   *
   * `@vectojs/core@1.32.1` bands the a11y projection per *region*, where a region
   * is the nearest `clipChildren` ancestor, so a DOM selection cannot run out of
   * one and into the next. Before this, the transcript, the control panel and the
   * floating perf panel were flat siblings, which made them a single implicit
   * region: dragging through the transcript also selected the panel rows whose
   * boxes happened to fall in the same horizontal bands. The panel sits at
   * `x = w - 202` with the document at `x = 32`, so every vertical drag crossed it.
   *
   * The transcript clipper is load-bearing beyond ordering: scrolling moves
   * `markdownView.y` negative, so a viewport that clips is what the document was
   * already conceptually scrolling inside.
   */
  private docRegion: Group;
  private chromeRegion: Group;
  private perfRegion: Group;

  /**
   * The library's writer for the current document, or `null` when nothing is
   * loaded. Recreated per document (and per loop pass) because a controller is
   * single-use: `close()` settles it, and it cannot rewind.
   */
  private stream: StreamController | null = null;
  private readonly asyncGeneration = new AsyncGeneration();

  private mdScrollY = 0;
  private mdAutoScroll = true;
  private lastPerfUpdate = 0;
  private mdDragging = false;
  private mdDragY = 0;
  // Scrollbar-thumb drag (mouse or touch), tracked at window level.
  private thumbDragging = false;
  private thumbStartClientY = 0;
  private thumbStartScroll = 0;

  // ── Search (Ctrl+F) ──
  private searchBar: SearchBar;
  private searchHighlight: MatchHighlight;
  /** Cached rendered-text index; rebuilt lazily when the document changes. */
  private searchIndex: DocText | null = null;
  private searchIndexDirty = true;
  private searchMatches: SearchMatch[] = [];
  private searchCurrent = -1;

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

    // Each region is its own clipper so a drag-selection stays inside it. Order
    // here is both paint order and the order a screen reader meets the regions,
    // because the engine emits regions in the order its depth-first walk first
    // reaches their clipper.
    this.docRegion = new Group(this.markdownView);
    this.docRegion.clipChildren = true;

    this.chromeRegion = new Group(this.controlPanel);
    this.chromeRegion.clipChildren = true;

    this.perfRegion = new Group(this.perfPanel);
    this.perfRegion.clipChildren = true;

    this.add(this.docRegion);
    this.add(this.scrollBar); // over the document, under the chrome/drop layers
    this.add(this.dropZone);
    this.add(this.chromeRegion);
    this.add(this.perfRegion);

    this.searchBar = new SearchBar({
      onQuery: (q) => this.onSearchQuery(q),
      onNext: () => this.stepSearch(1),
      onPrev: () => this.stepSearch(-1),
      onClose: () => this.closeSearch(),
    });
    this.add(this.searchBar);
    this.searchBar.close(); // hidden until Ctrl+F

    this.searchHighlight = new MatchHighlight();
    this.markdownView.add(this.searchHighlight);

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
    // panelHeight depends on the available width. Set the panel width before
    // reading it so the first resize on a narrow viewport selects the two-row
    // mobile layout instead of retaining the constructor's desktop height.
    this.controlPanel.width = w;
    const ctrlH = this.controlPanel.panelHeight;

    this.dropZone.x = 0;
    this.dropZone.y = 0;
    this.dropZone.width = w;
    this.dropZone.height = h;

    // The document region is the scroll viewport: it spans the area above the
    // control panel, and the transcript scrolls *inside* it. Sizing it is not
    // cosmetic — `clipChildren` clips to this box, so a zero-height region would
    // hide the document, and the engine ignores a zero-area clipper entirely,
    // which would silently put the transcript back in the root region.
    this.docRegion.x = 0;
    this.docRegion.y = 0;
    this.docRegion.width = w;
    this.docRegion.height = h - ctrlH;

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

    // Each region carries the placement; its child sits at the region origin.
    // `Group` composes its own transform onto its children, so leaving a child at
    // its old absolute offset would double the translation.
    this.chromeRegion.x = 0;
    this.chromeRegion.y = h - ctrlH;
    this.chromeRegion.width = w;
    this.chromeRegion.height = ctrlH;

    this.controlPanel.x = 0;
    this.controlPanel.y = 0;
    this.controlPanel.height = ctrlH;
    this.controlPanel.state = this.state;

    this.perfRegion.x = w - PERF_W - PERF_PAD;
    this.perfRegion.y = PERF_TOP;
    this.perfRegion.width = PERF_W;
    this.perfRegion.height = PERF_H;

    this.perfPanel.x = 0;
    this.perfPanel.y = 0;
    this.perfPanel.width = PERF_W;
    this.perfPanel.height = PERF_H;

    // Search bar floats top-center, clear of the perf panel (right) and the
    // shell's back chip (left).
    const barW = Math.min(560, w - 2 * PERF_TOP);
    this.searchBar.x = (w - barW) / 2;
    this.searchBar.y = PERF_TOP;
    this.searchBar.width = barW;
  }

  // ── Search (Ctrl+F) ─────────────────────────────────────────────────────────

  private rebuildSearchIndex(): void {
    this.searchIndex = collectDocumentText(this.markdownView);
    this.searchIndexDirty = false;
  }

  private openSearch(): void {
    if (!this.isDocumentShown()) return;
    this.searchBar.open();
    if (this.searchIndexDirty) this.rebuildSearchIndex();
    this.searchMatches = this.searchIndex
      ? findMatches(this.searchIndex, this.searchBar.query)
      : [];
    this.searchCurrent = this.searchMatches.length > 0 ? 0 : -1;
    this.searchBar.setResults(this.searchMatches.length, this.searchCurrent);
    this.scrollToMatch(this.searchCurrent);
    this.scene?.markDirty();
  }

  private closeSearch(): void {
    this.searchBar.close();
    this.searchHighlight.opacity = 0;
    this.scene?.markDirty();
  }

  /** Close the bar and forget the query, index, and matches — a new document. */
  private clearSearch(): void {
    this.searchBar.close();
    this.searchBar.clearQuery();
    this.searchIndex = null;
    this.searchIndexDirty = true;
    this.searchMatches = [];
    this.searchCurrent = -1;
    this.searchBar.setResults(0, -1);
    this.searchHighlight.opacity = 0;
  }

  private onSearchQuery(query: string): void {
    if (this.searchIndexDirty) this.rebuildSearchIndex();
    this.searchMatches = this.searchIndex ? findMatches(this.searchIndex, query) : [];
    this.searchCurrent = this.searchMatches.length > 0 ? 0 : -1;
    this.searchBar.setResults(this.searchMatches.length, this.searchCurrent);
    this.scrollToMatch(this.searchCurrent);
    this.scene?.markDirty();
  }

  private stepSearch(delta: number): void {
    if (this.searchIndexDirty) {
      this.rebuildSearchIndex();
      const index = this.searchIndex;
      this.searchMatches = index ? findMatches(index, this.searchBar.query) : [];
      if (this.searchMatches.length === 0) {
        this.searchCurrent = -1;
        this.searchBar.setResults(0, -1);
        this.searchHighlight.opacity = 0;
        return;
      }
      this.searchCurrent = Math.min(this.searchCurrent, this.searchMatches.length - 1);
    }
    if (this.searchMatches.length === 0) return;
    const n = this.searchMatches.length;
    this.searchCurrent = (this.searchCurrent + delta + n) % n;
    this.searchBar.setResults(n, this.searchCurrent);
    this.scrollToMatch(this.searchCurrent);
  }

  /** Scroll so the current match's line sits near the viewport center, and mark its line. */
  private scrollToMatch(index: number): void {
    const m = this.searchMatches[index];
    if (!m) {
      this.searchHighlight.opacity = 0;
      return;
    }
    const viewportH = this.height - this.controlPanel.panelHeight;
    this.scrollMarkdownTo(m.y + DOC_INSET - viewportH / 2);
    this.searchHighlight.y = m.y - 2;
    this.searchHighlight.height = m.height + 4;
    this.searchHighlight.width = this.markdownView.width;
    this.searchHighlight.opacity = 1;
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
    this.clearSearch();
  }

  private async openFile(file: File): Promise<void> {
    const generation = this.asyncGeneration.next();
    this.dropZone.loadingLabel = `Parsing ${file.name} …`;
    this.scene?.markDirty();

    const loaded = await loadFile(file);
    if (!this.asyncGeneration.isCurrent(generation)) return;

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

    this.clearSearch();
    this.layout();
    this.scene?.markDirty();
  }

  override isPointInside(): boolean {
    return false;
  }

  // The independent RefreshRateProbe keeps measuring raw display cadence while
  // the canvas sleeps. Streaming itself is pending animation so on-demand mode
  // cannot park between sub-token accumulator ticks.
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

      // The rendered text just changed, so the search index is stale.
      this.searchIndexDirty = true;

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
      const generation = this.asyncGeneration.next();
      void finishing?.close().then(() => {
        if (!this.asyncGeneration.isCurrent(generation)) return;
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
    this.asyncGeneration.destroy();
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
    // Entity.destroy() doesn't cascade to children (see Nexus/Dimension for
    // the same reasoning), so each composite tears down its retained controls.
    this.controlPanel.destroy();
    this.searchBar.destroy();
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

  // ── Keyboard shortcuts: Ctrl/Cmd+F = find, Space = play/pause, Esc = stop, L = toggle loop ──

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    // Ctrl/Cmd+F opens the reader's own find. The native browser bar would
    // scroll the projected DOM instead of the canvas, so it is never what the
    // user wants here.
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
      e.preventDefault();
      if (this.searchBar.visible) {
        this.searchBar.focusInput();
      } else {
        this.openSearch();
      }
      return;
    }

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
      if (this.searchBar.visible) {
        this.closeSearch();
        return;
      }
      this.stopAndClear();
    }
    if (e.code === 'KeyL') {
      this.state.loop = !this.state.loop;
      this.scene?.markDirty();
    }
  };
}

export default StreamReader;
