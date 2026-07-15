/**
 * Split a (possibly partial, mid-stream) Markdown string into renderable
 * segments. Plain Markdown — including ordinary ```code``` fences — stays in
 * `markdown` segments rendered by the engine's Markdown component. Blocks that
 * need SVG rendering are pulled out:
 *   - fenced ```mermaid / ```math / ```latex / ```abc blocks, and
 *   - display math delimited by `$$ … $$` (what real LLMs actually emit for
 *     block equations, rather than a ```math fence).
 * `closed` is false while the terminator hasn't streamed in yet.
 */
export type SpecialType = "mermaid" | "math" | "abc";

export type Segment =
  | { type: "markdown"; text: string }
  | { type: SpecialType; code: string; closed: boolean };

// Alternative 1 — a tagged fence: ```mermaid|math|latex|abc … ```
// Alternative 2 — display math: $$ … $$  (may span multiple lines)
// The two are scanned together so segments come out in document order.
const BLOCK =
  /(?:^|\n)```(mermaid|math|latex|abc)[ \t]*\n([\s\S]*?)(\n```\n?|$)|\$\$([\s\S]*?)(\$\$|$)/g;

export function segmentMarkdown(md: string): Segment[] {
  if (md === "") return [];
  const out: Segment[] = [];
  let last = 0;
  BLOCK.lastIndex = 0;

  const pushMarkdown = (text: string) => {
    if (text !== "") out.push({ type: "markdown", text });
  };

  let m: RegExpExecArray | null;
  while ((m = BLOCK.exec(md)) !== null) {
    pushMarkdown(md.slice(last, m.index));
    if (m[1] !== undefined) {
      // tagged fence
      const lang = m[1] === "latex" ? "math" : (m[1] as SpecialType);
      out.push({ type: lang, code: m[2], closed: m[3] !== "" });
      last = BLOCK.lastIndex;
      if (m[3] === "") break; // unterminated block runs to the end of the input
    } else {
      // $$ … $$ display math
      out.push({ type: "math", code: m[4], closed: m[5] !== "" });
      last = BLOCK.lastIndex;
      if (m[5] === "") break; // unterminated block runs to the end of the input
    }
  }
  pushMarkdown(md.slice(last));
  return out;
}
