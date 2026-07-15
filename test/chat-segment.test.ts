import { describe, expect, test } from "bun:test";
import { segmentMarkdown } from "../src/creations/chat/segment";

describe("segmentMarkdown", () => {
  test("plain markdown is a single markdown segment", () => {
    const segs = segmentMarkdown("# Hi\n\nsome **bold** text");
    expect(segs).toEqual([
      { type: "markdown", text: "# Hi\n\nsome **bold** text" },
    ]);
  });

  test("regular code fences stay inside the markdown segment", () => {
    const md = "before\n\n```js\nconst x = 1;\n```\n\nafter";
    const segs = segmentMarkdown(md);
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe("markdown");
  });

  test("a mermaid fence becomes its own closed segment", () => {
    const md = "text\n\n```mermaid\ngraph TD; A-->B\n```\n\nmore";
    const segs = segmentMarkdown(md);
    expect(segs).toEqual([
      { type: "markdown", text: "text\n" },
      { type: "mermaid", code: "graph TD; A-->B", closed: true },
      { type: "markdown", text: "\nmore" },
    ]);
  });

  test("math and abc fences are recognized (latex aliases to math)", () => {
    expect(segmentMarkdown("```math\nE=mc^2\n```")[0]).toEqual({
      type: "math",
      code: "E=mc^2",
      closed: true,
    });
    expect(segmentMarkdown("```latex\n\\frac12\n```")[0]).toEqual({
      type: "math",
      code: "\\frac12",
      closed: true,
    });
    expect(segmentMarkdown("```abc\nX:1\nK:C\nCDEF|\n```")[0]).toEqual({
      type: "abc",
      code: "X:1\nK:C\nCDEF|",
      closed: true,
    });
  });

  test("an unterminated special fence is an open segment (mid-stream)", () => {
    const segs = segmentMarkdown("intro\n\n```mermaid\ngraph TD; A-->B");
    expect(segs).toEqual([
      { type: "markdown", text: "intro\n" },
      { type: "mermaid", code: "graph TD; A-->B", closed: false },
    ]);
  });

  test("multiple special blocks split correctly", () => {
    const md = "```math\na\n```\nmid\n```abc\nb\n```";
    const segs = segmentMarkdown(md);
    expect(segs.map((s) => s.type)).toEqual(["math", "markdown", "abc"]);
  });

  test("empty input yields no segments", () => {
    expect(segmentMarkdown("")).toEqual([]);
  });

  test("$$ … $$ display math becomes a closed math segment", () => {
    const md =
      "The theorem states\n$$\n\\int_a^b f(x)\\,dx = F(b) - F(a)\n$$\nwhich is neat.";
    const segs = segmentMarkdown(md);
    expect(segs.map((s) => s.type)).toEqual(["markdown", "math", "markdown"]);
    expect(segs[1]).toEqual({
      type: "math",
      code: "\n\\int_a^b f(x)\\,dx = F(b) - F(a)\n",
      closed: true,
    });
  });

  test("an unterminated $$ block is open mid-stream", () => {
    const segs = segmentMarkdown("intro\n$$\n\\Phi(x) = \\int_a^x f(t)");
    expect(segs).toEqual([
      { type: "markdown", text: "intro\n" },
      { type: "math", code: "\n\\Phi(x) = \\int_a^x f(t)", closed: false },
    ]);
  });

  test("inline single-$ is left in the markdown (not treated as a block)", () => {
    // A lone $ (e.g. currency, or inline $f(x)$) must not open a display-math
    // block — only $$ does. Inline handling is deliberately left to the caller.
    const segs = segmentMarkdown("it costs $5 and returns $f(x)$ inline");
    expect(segs).toEqual([
      { type: "markdown", text: "it costs $5 and returns $f(x)$ inline" },
    ]);
  });
});
