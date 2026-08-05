/**
 * File loading for the stream reader.
 *
 * Every accepted file is treated as Markdown source. Plain text is valid
 * Markdown — a `.txt` renders as a sequence of paragraphs — so there is no
 * separate plain-text path to choose between, and no format sniffing beyond
 * decoding the bytes as UTF-8.
 *
 * "Accepted" is the operative word: because loading REPLACES the open document,
 * an unfiltered load path is destructive. `isAcceptedFile()` is the one gate, and
 * both entry points (picker and drop) must go through it — see its doc comment.
 */

export interface LoadedFile {
  /** Markdown source, streamed verbatim into `Markdown.createStream()`. */
  source: string;
  /** Display name of the loaded file. */
  fileName: string;
}

/** File extensions offered by the picker and accepted by the drop zone. */
export const ACCEPTED_EXTENSIONS = '.md,.markdown,.txt';

/**
 * Does this file look like Markdown source we should load?
 *
 * `ACCEPTED_EXTENSIONS` is an `input.accept` string, which constrains only the
 * picker's own dialog — it has no effect on a drop. Both paths need this check,
 * because opening a file discards whatever is on screen: dropping a PNG used to
 * replace the document with the mojibake of its own bytes, and dropping an SVG
 * dragged out of the document replaced it with the text of its own rendering.
 *
 * Extension, not MIME: a `drop` hands over whatever type the OS guessed, and
 * `.md` is routinely reported as `''` or `application/octet-stream`. Extension is
 * also exactly what the picker filter promises, so the two paths agree.
 */
export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.split(',').some((ext) => name.endsWith(ext));
}

export async function loadFile(file: File): Promise<LoadedFile> {
  return { source: await file.text(), fileName: file.name };
}
