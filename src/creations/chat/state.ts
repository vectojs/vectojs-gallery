/**
 * StreamState — the single source of truth for the streaming session.
 * All mutations go through this; the UI reads from it on each frame.
 *
 * This owns *playback* only: how fast text is revealed, and whether it is
 * running. Parsing, reconciling, and rendering all belong to
 * `Markdown.createStream()`. The split matters because the controller's own
 * `pacing` option is fixed at construction and has no pause, while this demo's
 * whole point is a live rate slider and a pause button — so the controller is
 * created *without* pacing (pure animation-frame coalescing) and this state
 * decides what to hand it each frame.
 */

export type StreamStatus = 'idle' | 'streaming' | 'paused' | 'done';

export interface StreamState {
  /** Full Markdown source of the loaded file. */
  content: string;
  /** `content` split into playback units. */
  tokens: string[];
  /** Display name of the loaded file. */
  fileName: string;
  /** Index of the next token to stream. */
  cursor: number;
  /** Characters already revealed. */
  visible: string;
  /** Current play state. */
  status: StreamStatus;
  /** Tokens per second (1 token ≈ 1 character for benchmark purposes). */
  tokenRate: number;
  /** Accumulated fractional token count from the last frame. */
  accumulator: number;
  /** Whether to loop back to the start when done. */
  loop: boolean;
}

export function createStreamState(): StreamState {
  return {
    content: '',
    tokens: [],
    fileName: '',
    cursor: 0,
    visible: '',
    status: 'idle',
    tokenRate: 100,
    accumulator: 0,
    loop: false,
  };
}

/**
 * Advance the stream by `dt` milliseconds, returning the text revealed this
 * tick — the empty string when the rate has not yet produced a whole token.
 *
 * Returns the chunk rather than a count because the caller writes it straight
 * into the Markdown stream; recomputing it from `visible` and a length would be
 * the same slice done twice.
 */
export function tickStream(state: StreamState, dt: number): string {
  if (state.status !== 'streaming') return '';
  if (state.cursor >= state.tokens.length) {
    state.status = 'done';
    return '';
  }

  const tokensPerMs = state.tokenRate / 1000;
  state.accumulator += tokensPerMs * dt;
  const toAdd = Math.floor(state.accumulator);
  state.accumulator -= toAdd;

  if (toAdd === 0) return '';

  const end = Math.min(state.cursor + toAdd, state.tokens.length);
  let chunk = '';
  for (let i = state.cursor; i < end; i++) {
    chunk += state.tokens[i];
  }
  state.visible += chunk;
  state.cursor = end;

  if (state.cursor >= state.tokens.length) state.status = 'done';
  return chunk;
}

/** Rewind playback to the start without touching the loaded source. */
export function rewindStream(state: StreamState): void {
  state.cursor = 0;
  state.visible = '';
  state.accumulator = 0;
}

/**
 * Split text into tokens simulating an LLM tokenizer.
 * - `![alt](url)` image markdown: the WHOLE span is one token, matched
 *   before any other rule. A `data:` URI can be hundreds of thousands of
 *   base64 characters — tokenizing it normally (alphanumeric runs split by
 *   every `+`/`/`) produces tens of thousands of tokens of pure gibberish
 *   that visibly "type out" for minutes at typical stream rates before any
 *   real content appears, which reads as the reader being broken rather than
 *   loading. An image isn't meant to be watched character-by-character, so it
 *   reveals atomically in a single tick instead.
 * - Chinese characters: 1-2 characters per token.
 * - English words: words with trailing space, or punctuation.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const regex =
    /!\[[^\]]*\]\([^)]*\)|[一-龥]{1,2}|[a-zA-Z0-9]+(?:'[a-zA-Z]+)?\s*|[^一-龥a-zA-Z0-9\s]|\s+/g;
  const matches = text.match(regex);
  return matches || [text];
}
