import { describe, expect, test } from "bun:test";
import {
  mathToUnicode,
  renderInlineMath,
} from "../src/creations/chat/math-inline";

describe("mathToUnicode", () => {
  test("Greek letters", () => {
    expect(mathToUnicode("\\Phi")).toBe("Φ");
    expect(mathToUnicode("\\alpha + \\beta")).toBe("α + β");
    expect(mathToUnicode("\\xi_h")).toBe("ξₕ");
  });

  test("operators and relations", () => {
    expect(mathToUnicode("\\int_a^b")).toBe("∫ₐᵇ");
    expect(mathToUnicode("a \\leq b \\neq c")).toBe("a ≤ b ≠ c");
    expect(mathToUnicode("x \\in [a, b]")).toBe("x ∈ [a, b]");
  });

  test("superscripts and subscripts", () => {
    expect(mathToUnicode("x^2")).toBe("x²");
    expect(mathToUnicode("x^{10}")).toBe("x¹⁰");
    expect(mathToUnicode("a_1")).toBe("a₁");
  });

  test("unmappable script stays readable, not raw", () => {
    // capital B has no subscript glyph — keep it grouped rather than dropping it
    expect(mathToUnicode("a_{Bc}")).toBe("a_(Bc)");
  });

  test("\\frac and \\sqrt", () => {
    expect(mathToUnicode("\\frac{a}{b}")).toBe("(a)/(b)");
    expect(mathToUnicode("\\sqrt{2}")).toBe("√(2)");
  });

  test("spacing commands collapse", () => {
    expect(mathToUnicode("f(x) \\, dx")).toBe("f(x) dx");
    expect(mathToUnicode("x \\quad y")).toBe("x y");
  });

  test("unknown command keeps its name (no backslash), not raw TeX", () => {
    expect(mathToUnicode("\\foo(x)")).toBe("foo(x)");
  });
});

describe("renderInlineMath", () => {
  test("converts inline math, strips $ delimiters", () => {
    expect(renderInlineMath("the value $f(x)$ is continuous")).toBe(
      "the value f(x) is continuous",
    );
    expect(renderInlineMath("let $\\Phi(x) = \\int_a^x f(t)$ here")).toBe(
      "let Φ(x) = ∫ₐˣ f(t) here",
    );
  });

  test("leaves currency untouched (spans starting with a digit)", () => {
    expect(renderInlineMath("it costs $5 and then $10.99 total")).toBe(
      "it costs $5 and then $10.99 total",
    );
  });

  test("leaves an unterminated inline span alone (mid-stream)", () => {
    expect(renderInlineMath("partial $f(x")).toBe("partial $f(x");
  });
});
