/**
 * File parsing utilities.
 * - Plain text  → returns as-is
 * - Markdown    → returns raw source (rendered by @vectojs/ui Markdown)
 * - EPUB        → walks each chapter's XHTML in spine order via JSZip,
 *                  converting to Markdown text with embedded images (as
 *                  `![alt](data:...)`), so fixed-layout / image-only EPUBs
 *                  (manga, illustrated fiction) render instead of coming
 *                  out empty — see forge/findings.md 2026-07-19.
 * - Other       → tries UTF-8 decode, returns raw text
 */

import JSZip from "jszip";

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** Resolve an `<img src>`/`<image xlink:href>` path relative to its chapter's directory. */
function resolveEpubPath(baseDir: string, relative: string): string {
  if (relative.startsWith("data:")) return relative;
  const url = new URL(relative, `file:///${baseDir}`);
  return decodeURIComponent(url.pathname.slice(1));
}

async function embedEpubImage(
  zip: JSZip,
  baseDir: string,
  src: string,
): Promise<string | null> {
  const path = resolveEpubPath(baseDir, src);
  const entry = zip.file(path);
  if (!entry) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = IMAGE_MIME[ext];
  if (!mime) return null;
  const base64 = await entry.async("base64");
  return `data:${mime};base64,${base64}`;
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "li",
  "blockquote",
  "figure",
  "figcaption",
]);
const HEADING_LEVEL: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/**
 * Recursively convert one XHTML chapter's body into Markdown text. Inline
 * formatting (bold/italic/links) is intentionally flattened to plain text —
 * this only needs to preserve paragraph/heading breaks and embed images in
 * their original document position, not achieve full HTML→Markdown fidelity.
 */
async function xhtmlNodeToMarkdown(
  node: ChildNode,
  zip: JSZip,
  baseDir: string,
): Promise<string> {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "img" || tag === "image") {
    const src =
      el.getAttribute("src") ??
      el.getAttribute("xlink:href") ??
      el.getAttribute("href");
    if (!src) return "";
    const dataUri = await embedEpubImage(zip, baseDir, src);
    if (!dataUri) return "";
    const alt = el.getAttribute("alt") ?? "";
    return `\n\n![${alt}](${dataUri})\n\n`;
  }
  if (tag === "br") return "\n";
  if (tag === "script" || tag === "style") return "";

  const childParts: string[] = [];
  for (const child of Array.from(el.childNodes)) {
    childParts.push(await xhtmlNodeToMarkdown(child, zip, baseDir));
  }
  const inner = childParts.join("");

  const headingLevel = HEADING_LEVEL[tag];
  if (headingLevel)
    return `\n\n${"#".repeat(headingLevel)} ${inner.trim()}\n\n`;
  if (BLOCK_TAGS.has(tag)) return `\n\n${inner.trim()}\n\n`;
  return inner;
}

export interface ParsedFile {
  /** Cleaned plain text used for streaming character-by-character */
  plainText: string;
  /** Original source (MD or plain) for display purposes */
  source: string;
  /** MIME-level type hint */
  kind: "text" | "markdown" | "epub";
}

// ── EPUB (JSZip-based) ────────────────────────────────────────────────────────

/**
 * Parse an EPUB file by:
 * 1. Unzipping with JSZip
 * 2. Reading META-INF/container.xml to find the OPF path
 * 3. Parsing the OPF to get spine item order + manifest href map
 * 4. Extracting text from each XHTML in spine order
 */
async function parseEpub(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // Step 1: Find the OPF path from container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml)
    throw new Error("Invalid EPUB: missing META-INF/container.xml");

  const containerDoc = new DOMParser().parseFromString(
    containerXml,
    "application/xml",
  );
  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: no rootfile in container.xml");

  // Step 2: Parse the OPF
  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error(`Invalid EPUB: missing OPF at ${opfPath}`);

  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // Build manifest id → href map
  const manifest = new Map<string, string>();
  for (const item of opfDoc.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, href);
  }

  // Get spine order
  const spineIds: string[] = [];
  for (const itemref of opfDoc.querySelectorAll("spine > itemref")) {
    const idref = itemref.getAttribute("idref");
    if (idref) spineIds.push(idref);
  }

  // Step 3: Extract text from each spine item in order
  const parts: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;

    // Resolve path relative to OPF directory
    const fullPath = opfDir + href;
    const content = await zip.file(fullPath)?.async("text");
    if (!content) continue;

    // Parse XHTML and convert to Markdown, preserving embedded images
    const doc = new DOMParser().parseFromString(
      content,
      "application/xhtml+xml",
    );
    const chapterDir = fullPath.includes("/")
      ? fullPath.substring(0, fullPath.lastIndexOf("/") + 1)
      : "";
    const text = doc.body
      ? (await xhtmlNodeToMarkdown(doc.body, zip, chapterDir)).trim()
      : "";
    if (text) parts.push(text);
  }

  if (parts.length === 0) {
    // Fallback: try to extract from any .xhtml/.html files in the zip
    const htmlFiles = Object.keys(zip.files).filter(
      (f) => /\.(xhtml|html|htm)$/i.test(f) && !f.startsWith("META-INF"),
    );
    htmlFiles.sort();
    for (const path of htmlFiles) {
      const content = await zip.file(path)?.async("text");
      if (!content) continue;
      const doc = new DOMParser().parseFromString(
        content,
        "application/xhtml+xml",
      );
      const chapterDir = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/") + 1)
        : "";
      const text = doc.body
        ? (await xhtmlNodeToMarkdown(doc.body, zip, chapterDir)).trim()
        : "";
      if (text) parts.push(text);
    }
  }

  return parts.join("\n\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".epub")) {
    const text = await parseEpub(file);
    // The extracted text is now real Markdown (headings, paragraph breaks,
    // embedded `![alt](data:...)` images) — route it through the same
    // Markdown-rendering path ("epub" previously fell into the plain-text
    // StreamTextEntity path, which had no way to render an <img>).
    return { plainText: text, source: text, kind: "markdown" };
  }

  const raw = await file.text();

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return { plainText: raw, source: raw, kind: "markdown" };
  }

  return { plainText: raw, source: raw, kind: "text" };
}
