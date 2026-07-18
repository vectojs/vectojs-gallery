/**
 * File parsing utilities.
 * - Plain text  → returns as-is
 * - Markdown    → returns raw source (rendered by @vectojs/ui Markdown)
 * - EPUB        → extracts all chapter text in spine order via JSZip
 * - Other       → tries UTF-8 decode, returns raw text
 */

import JSZip from "jszip";

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

    // Parse XHTML and extract text
    const doc = new DOMParser().parseFromString(
      content,
      "application/xhtml+xml",
    );
    const text = doc.body?.textContent?.trim() ?? "";
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
      const text = doc.body?.textContent?.trim() ?? "";
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
    return { plainText: text, source: text, kind: "epub" };
  }

  const raw = await file.text();

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return { plainText: raw, source: raw, kind: "markdown" };
  }

  return { plainText: raw, source: raw, kind: "text" };
}
