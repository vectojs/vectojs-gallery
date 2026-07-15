import { describe, expect, test } from "bun:test";
import { tokenize } from "../src/creations/chat/tokenize";

describe("tokenize (for token/s playback)", () => {
  test("concatenating the tokens reproduces the input exactly", () => {
    const s = "Hello, **world**!\n\nA new line.";
    expect(tokenize(s).join("")).toBe(s);
  });

  test("splits into words and whitespace runs", () => {
    expect(tokenize("hi there")).toEqual(["hi", " ", "there"]);
  });

  test("keeps newlines as their own tokens-ish (whitespace run)", () => {
    expect(tokenize("a\n\nb")).toEqual(["a", "\n\n", "b"]);
  });

  test("empty string yields no tokens", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("long word is a single token", () => {
    expect(tokenize("supercalifragilistic")).toEqual(["supercalifragilistic"]);
  });
});
