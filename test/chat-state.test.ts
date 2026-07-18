import { describe, expect, test } from "bun:test";
import {
  createStreamState,
  tickStream,
  tokenize,
} from "../src/creations/chat/state";

describe("tokenize (simulated LLM tokenizer for streaming playback)", () => {
  test("concatenating the tokens reproduces the input exactly", () => {
    const s = "Hello, **world**!\n\nA new line.";
    expect(tokenize(s).join("")).toBe(s);
  });

  test("splits English words with a trailing space as one token", () => {
    expect(tokenize("hi there")).toEqual(["hi ", "there"]);
  });

  test("groups Chinese characters 1-2 per token", () => {
    const cjk = "你好世界";
    const tokens = tokenize(cjk);
    expect(tokens.join("")).toBe(cjk);
    for (const t of tokens) expect(t.length).toBeLessThanOrEqual(2);
  });

  test("empty string yields no tokens", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("tickStream", () => {
  function streaming(content: string, tokenRate: number) {
    const state = createStreamState();
    state.content = content;
    state.tokens = tokenize(content);
    state.status = "streaming";
    state.tokenRate = tokenRate;
    return state;
  }

  test("advances `visible` by whole tokens as the accumulator crosses 1", () => {
    const state = streaming("abcde", 1000); // 1 token/ms
    const added = tickStream(state, 3); // 3ms -> ~3 tokens (chars here)
    expect(added).toBeGreaterThan(0);
    expect(state.visible.length).toBe(added);
    expect(state.content.startsWith(state.visible)).toBe(true);
  });

  test("transitions to done once all tokens are consumed (no loop)", () => {
    const state = streaming("ab", 100000); // fast enough to finish in one tick
    tickStream(state, 1000);
    expect(state.status).toBe("done");
    expect(state.visible).toBe("ab");
  });

  test("loops back to the start instead of finishing when loop is set", () => {
    const state = streaming("ab", 100000);
    state.loop = true;
    tickStream(state, 1000);
    expect(state.status).toBe("streaming");
    expect(state.cursor).toBe(0);
    expect(state.visible).toBe("");
  });

  test("a non-streaming state never advances", () => {
    const state = streaming("abcde", 1000);
    state.status = "paused";
    expect(tickStream(state, 100)).toBe(0);
    expect(state.visible).toBe("");
  });
});
