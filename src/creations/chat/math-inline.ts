/**
 * Best-effort inline-math rendering for the chat.
 *
 * Block math ($$…$$) is pulled out by segmentMarkdown and rendered with KaTeX to
 * an SVG. Inline math ($…$), though, lives inside a paragraph, and the engine's
 * Markdown component lays out plain text — there's no clean way to drop a rendered
 * SVG *inline* between words. So instead of leaving raw TeX like `$\Phi(x)$` on
 * screen, we convert common inline TeX to readable Unicode (`Φ(x)`) and strip the
 * `$` delimiters. It's not a full typesetter — it's "readable, not raw."
 */

// \command → Unicode. Longer names are matched by the \[a-zA-Z]+ regex, so map
// order doesn't matter (lookup is exact by captured name).
const COMMANDS: Record<string, string> = {
  // lowercase Greek
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  // uppercase Greek
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  // operators / relations / misc
  int: "∫",
  iint: "∬",
  oint: "∮",
  sum: "∑",
  prod: "∏",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  propto: "∝",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  mapsto: "↦",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  forall: "∀",
  exists: "∃",
  neg: "¬",
  land: "∧",
  lor: "∨",
  angle: "∠",
  perp: "⊥",
  parallel: "∥",
  sqrt: "√",
  prime: "′",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  bullet: "∙",
  deg: "°",
  ell: "ℓ",
  hbar: "ℏ",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  // spacing / structural commands become a single space (or nothing)
  quad: " ",
  qquad: "  ",
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
  left: "",
  right: "",
  displaystyle: "",
  textstyle: "",
  limits: "",
  nolimits: "",
};

// prettier-ignore
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
  '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ',
  k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ',
  v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};

// prettier-ignore
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇',
  '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ',
  p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

function mapScript(
  body: string,
  table: Record<string, string>,
  raw: "^" | "_",
): string {
  let out = "";
  for (const ch of body) {
    if (table[ch]) out += table[ch];
    else return `${raw}${body.length > 1 ? `(${body})` : body}`; // unmappable → keep readable
  }
  return out;
}

/** Convert a TeX fragment to best-effort readable Unicode. */
export function mathToUnicode(tex: string): string {
  let s = tex;
  // \frac{a}{b} → (a)/(b), \sqrt{a} → √(a) — do these before generic commands.
  s = s.replace(
    /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
    (_, a, b) => `(${a})/(${b})`,
  );
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√(${a})`);
  // superscripts / subscripts: x^2, x^{10}, a_i, a_{ij}. Braced and single forms
  // are handled in a SINGLE pass each so an unmappable fallback like `_(Bc)` isn't
  // re-scanned (the `(` would otherwise be read as a fresh subscript).
  s = s.replace(/\^(?:\{([^{}]*)\}|(\S))/g, (_, braced, single) =>
    mapScript(braced ?? single, SUPERSCRIPT, "^"),
  );
  s = s.replace(/_(?:\{([^{}]*)\}|(\S))/g, (_, braced, single) =>
    mapScript(braced ?? single, SUBSCRIPT, "_"),
  );
  // \command → unicode (unknown commands keep their name, minus the backslash)
  s = s.replace(/\\([a-zA-Z]+|[,;:!])/g, (_m, name) => COMMANDS[name] ?? name);
  // leftover braces from grouping we didn't consume
  s = s.replace(/[{}]/g, "");
  // collapse the runs of spaces that spacing-commands leave behind
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Replace inline `$…$` math in a Markdown string with readable Unicode. Only
 * spans that start with a non-digit are treated as math, so currency ("$5",
 * "$10.99") is left untouched. `$$…$$` display blocks must already be removed
 * (segmentMarkdown does this) before this runs.
 */
export function renderInlineMath(md: string): string {
  return md.replace(/\$(?=\S)([^$\n]{1,80}?)\$/g, (whole, body: string) => {
    if (/^\d/.test(body.trim())) return whole; // currency, not math
    return mathToUnicode(body);
  });
}
