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

  test('returns the revealed chunk and appends it to `visible`', () => {
    const state = streaming('abcde', 1000); // 1 token/ms
    const chunk = tickStream(state, 3); // 3ms -> ~3 tokens (chars here)
    expect(chunk.length).toBeGreaterThan(0);
    expect(state.visible).toBe(chunk);
    expect(state.content.startsWith(state.visible)).toBe(true);
  });

  test('consecutive ticks return only what is new, never the accumulated text', () => {
    // The caller writes the return value straight into an open Markdown stream,
    // so returning the whole document would duplicate everything before it.
    const state = streaming('abcdef', 1000);
    const first = tickStream(state, 2);
    const second = tickStream(state, 2);
    expect(first + second).toBe(state.visible);
    expect(second).not.toContain(first);
  });

  test('transitions to done once all tokens are consumed', () => {
    const state = streaming('ab', 100000); // fast enough to finish in one tick
    tickStream(state, 1000);
    expect(state.status).toBe('done');
    expect(state.visible).toBe('ab');
  });

  test('does not loop on its own — the caller drives a replay', () => {
    // Looping cannot live in here any more: a replay has to also discard and
    // recreate the Markdown StreamController, which this module knows nothing
    // about. `loop` is read by the caller once the stream reports `done`.
    const state = streaming('ab', 100000);
    state.loop = true;
    tickStream(state, 1000);
    expect(state.status).toBe('done');
    expect(state.visible).toBe('ab');
  });

  test('a non-streaming state never advances', () => {
    const state = streaming('abcde', 1000);
    state.status = 'paused';
    expect(tickStream(state, 100)).toBe('');
    expect(state.visible).toBe('');
  });

  test('a tick too short to complete a token reveals nothing', () => {
    const state = streaming('abcde', 100); // 1 token / 10ms
    expect(tickStream(state, 1)).toBe('');
    expect(state.visible).toBe('');
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
    tickStream(state, 1000);
    expect(state.visible).toBe('abc');

    rewindStream(state);
    expect(state.visible).toBe('');
    expect(state.cursor).toBe(0);
    expect(state.accumulator).toBe(0);
    // The source and its name survive, which is what lets Play replay it.
    expect(state.content).toBe('abc');
    expect(state.fileName).toBe('doc.md');
  });
});
