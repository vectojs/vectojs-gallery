/**
 * StreamState — the single source of truth for the streaming session.
 * All mutations go through this; the UI reads from it on each frame.
 */

export type StreamStatus = "idle" | "streaming" | "paused" | "done";

export interface StreamState {
  /** All characters extracted from the loaded file */
  content: string;
  /** Tokenized array for streaming */
  tokens: string[];
  /** File format hint */
  kind: "text" | "markdown" | "epub";
  /** Display name of the loaded file */
  fileName: string;
  /** Index of the next token to stream */
  cursor: number;
  /** Characters already visible / streamed out */
  visible: string;
  /** Current play state */
  status: StreamStatus;
  /** Tokens per second (1 token ≈ 1 character for benchmark purposes) */
  tokenRate: number;
  /** Accumulated fractional char count from the last frame */
  accumulator: number;
  /** Whether to loop back to the start when done */
  loop: boolean;
}

export function createStreamState(): StreamState {
  return {
    content: "",
    tokens: [],
    kind: "text",
    fileName: "",
    cursor: 0,
    visible: "",
    status: "idle",
    tokenRate: 100,
    accumulator: 0,
    loop: false,
  };
}

/**
 * Advance the stream by `dt` milliseconds.
 * Returns the number of new characters appended.
 */
export function tickStream(state: StreamState, dt: number): number {
  if (state.status !== "streaming") return 0;
  if (state.cursor >= state.tokens.length) {
    if (state.loop) {
      state.cursor = 0;
      state.visible = "";
      state.accumulator = 0;
    } else {
      state.status = "done";
    }
    return 0;
  }

  const tokensPerMs = state.tokenRate / 1000;
  state.accumulator += tokensPerMs * dt;
  const toAdd = Math.floor(state.accumulator);
  state.accumulator -= toAdd;

  if (toAdd === 0) return 0;

  const end = Math.min(state.cursor + toAdd, state.tokens.length);
  let chunk = "";
  for (let i = state.cursor; i < end; i++) {
    chunk += state.tokens[i];
  }
  state.visible += chunk;
  state.cursor = end;

  if (state.cursor >= state.tokens.length) {
    if (state.loop) {
      state.cursor = 0;
      state.visible = "";
      state.accumulator = 0;
    } else {
      state.status = "done";
    }
  }
  return chunk.length;
}

/**
 * Split text into tokens simulating an LLM tokenizer.
 * - Chinese characters: 1-2 characters per token.
 * - English words: Words with trailing space, or punctuation.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const regex =
    /[一-龥]{1,2}|[a-zA-Z0-9]+(?:'[a-zA-Z]+)?\s*|[^一-龥a-zA-Z0-9\s]|\s+/g;
  const matches = text.match(regex);
  return matches || [text];
}
