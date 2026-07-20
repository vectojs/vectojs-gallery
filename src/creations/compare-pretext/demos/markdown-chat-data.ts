/**
 * Original conversation seeds for the markdown-chat demo — a VectoJS-themed
 * exchange (not copied from the pretext original) that exercises the markdown
 * features VectoJS's `Markdown` component renders: headings, lists, block
 * quotes, fenced code, inline code, links, emphasis, and mixed-script/emoji
 * inline text. The seeds are repeated (with a running index appended) to reach
 * the 10,000-message scale the demo virtualizes.
 */

export interface ChatSeed {
  role: "assistant" | "user";
  markdown: string;
}

function m(role: "assistant" | "user", ...lines: string[]): ChatSeed {
  return { role, markdown: lines.join("\n") };
}

export const CHAT_SEEDS: ChatSeed[] = [
  m(
    "user",
    "Can VectoJS give me exact bubble heights *before* I render a message list?",
    "",
    "I care about:",
    "- exact heights for virtualization",
    "- no off-screen measure pass",
    "- `markdown` inline styling",
  ),
  m(
    "assistant",
    "Yes — that is the whole point of a **canvas-native** layout engine.",
    "",
    "`LayoutEngine.prepare()` measures once, `layoutPrepared()` re-flows for free. There is no DOM to reflow, so a `VirtualList` can ask for a row's height without ever mounting it.",
  ),
  m(
    "user",
    "My side stays short. Your side has the hard stuff: Beijing 北京, Arabic مرحبا, emoji 👩‍🚀, and long links like https://vectojs.org/docs/layout-engine",
  ),
  m(
    "assistant",
    "### What a chat renderer actually needs",
    "",
    "1. Parse the markdown once.",
    "2. Normalize into blocks and inline runs.",
    "3. Flow paragraphs with the shared layout engine.",
    "4. Keep fenced code on the preserved-whitespace path.",
  ),
  m(
    "user",
    "Let's stress it with **real markdown**: ***nested emphasis***, `inline code`, [links](https://vectojs.org), and messages that are clearly richer on your side than mine.",
  ),
  m(
    "assistant",
    "> If the exact height is known in advance, virtualization stops being guesswork.",
    ">",
    "> It becomes geometry.",
    "",
    "That is why the primitive stays low-level and composable.",
  ),
  m("user", "Show me the code path for a fenced block, then."),
  m(
    "assistant",
    "```ts",
    "const md = new Markdown(text, { maxWidth: 520 });",
    "// height is known immediately — no reflow, no mount",
    "row.height = md.height;",
    "```",
    "",
    "The bubble sizes itself to that height, and the list positions the next row from it.",
  ),
  m(
    "user",
    "And the design? The left column should feel light and editorial; my side can stay bubble-y.",
  ),
  m(
    "assistant",
    "Agreed. Assistant messages read as flowing prose; user messages sit in tinted bubbles.",
    "",
    "- assistant: transparent, editorial",
    "- user: filled bubble, right-aligned",
    "",
    "Both measured the same way, so the list scrolls at a steady frame rate no matter how many thousands of rows exist.",
  ),
];
