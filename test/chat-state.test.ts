import { describe, expect, test } from 'bun:test';
import { createStreamState, rewindStream, tickStream, tokenize } from '../src/creations/chat/state';

describe('tokenize (simulated LLM tokenizer for streaming playback)', () => {
  test('concatenating the tokens reproduces the input exactly', () => {
    const s = 'Hello, **world**!\n\nA new line.';
    expect(tokenize(s).join('')).toBe(s);
  });

  test('splits English words with a trailing space as one token', () => {
    expect(tokenize('hi there')).toEqual(['hi ', 'there']);
  });

  test('groups Chinese characters 1-2 per token', () => {
    const cjk = '你好世界';
    const tokens = tokenize(cjk);
    expect(tokens.join('')).toBe(cjk);
    for (const t of tokens) expect(t.length).toBeLessThanOrEqual(2);
  });

  test('empty string yields no tokens', () => {
    expect(tokenize('')).toEqual([]);
  });

  test('an image span is one atomic token however long its URL', () => {
    // A `data:` URI can run to hundreds of thousands of base64 characters.
    // Split normally it would "type out" as minutes of gibberish, so the whole
    // span has to reveal in a single tick.
    const src = `![alt](data:image/png;base64,${'AAAA+/'.repeat(200)})`;
    expect(tokenize(src)).toEqual([src]);
  });

  test('a single image token can exceed the stream buffer default', () => {
    // This is why the Creation sizes `maxBufferedChars` from the document rather
    // than taking the controller's 64KiB default. Admission accepts an oversize
    // chunk only when the buffer is otherwise empty; with anything already
    // accepted-but-uncommitted the write parks in the single blocked slot and a
    // further write that frame rejects. Reproduced in Chromium before the fix as
    // an unhandled "StreamController already has a blocked write".
    const DEFAULT_MAX_BUFFERED_CHARS = 64 * 1024;
    const src = `![alt](data:image/png;base64,${'A'.repeat(70_000)})`;
    const tokens = tokenize(src);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].length).toBeGreaterThan(DEFAULT_MAX_BUFFERED_CHARS);
    // Sizing from the whole source is therefore always sufficient: no chunk the
    // ticker can build is longer than the document it came from.
    expect(src.length).toBeGreaterThanOrEqual(tokens[0].length);
  });
});

describe('tickStream', () => {
  function streaming(content: string, tokenRate: number) {
    const state = createStreamState();
    state.content = content;
    state.tokens = tokenize(content);
    state.status = 'streaming';
    state.tokenRate = tokenRate;
    return state;
  }

  test('returns the revealed chunk, which is a prefix of the source', () => {
    const state = streaming('abcde', 1000); // 1 token/ms
    const chunk = tickStream(state, 3); // 3ms -> ~3 tokens (chars here)
    expect(chunk.length).toBeGreaterThan(0);
    // The revealed text is not mirrored on the state: the Markdown document owns
    // everything committed so far. What this module guarantees is that each chunk
    // continues the source exactly, so the concatenation is always a prefix.
    expect(state.content.startsWith(chunk)).toBe(true);
  });

  test('consecutive ticks return only what is new, never the accumulated text', () => {
    // The caller writes the return value straight into an open Markdown stream,
    // so returning the whole document would duplicate everything before it.
    const state = streaming('abcdef', 1000);
    const first = tickStream(state, 2);
    const second = tickStream(state, 2);
    expect(state.content.startsWith(first + second)).toBe(true);
    expect(second).not.toContain(first);
  });

  test('transitions to done once all tokens are consumed', () => {
    const state = streaming('ab', 100000); // fast enough to finish in one tick
    expect(tickStream(state, 1000)).toBe('ab');
    expect(state.status).toBe('done');
  });

  test('does not loop on its own — the caller drives a replay', () => {
    // Looping cannot live in here any more: a replay has to also discard and
    // recreate the Markdown StreamController, which this module knows nothing
    // about. `loop` is read by the caller once the stream reports `done`.
    const state = streaming('ab', 100000);
    state.loop = true;
    expect(tickStream(state, 1000)).toBe('ab');
    expect(state.status).toBe('done');
  });

  test('a non-streaming state never advances', () => {
    const state = streaming('abcde', 1000);
    state.status = 'paused';
    expect(tickStream(state, 100)).toBe('');
    expect(state.cursor).toBe(0);
  });

  test('a tick too short to complete a token reveals nothing', () => {
    const state = streaming('abcde', 100); // 1 token / 10ms
    expect(tickStream(state, 1)).toBe('');
    expect(state.cursor).toBe(0);
  });
});

describe('rewindStream', () => {
  test('resets playback position without discarding the loaded source', () => {
    const state = createStreamState();
    state.content = 'abc';
    state.tokens = tokenize('abc');
    state.fileName = 'doc.md';
    state.status = 'streaming';
    state.tokenRate = 100000;
    expect(tickStream(state, 1000)).toBe('abc');
    expect(state.cursor).toBe(state.tokens.length);

    rewindStream(state);
    expect(state.cursor).toBe(0);
    expect(state.accumulator).toBe(0);
    // The source and its name survive, which is what lets Play replay it.
    expect(state.content).toBe('abc');
    expect(state.fileName).toBe('doc.md');
  });
});
