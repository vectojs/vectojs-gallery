/**
 * File loading for the stream reader.
 *
 * Every accepted file is treated as Markdown source. Plain text is valid
 * Markdown — a `.txt` renders as a sequence of paragraphs — so there is no
 * separate plain-text path to choose between, and no format sniffing beyond
 * decoding the bytes as UTF-8.
 */

export interface LoadedFile {
  /** Markdown source, streamed verbatim into `Markdown.createStream()`. */
  source: string;
  /** Display name of the loaded file. */
  fileName: string;
}

/** File extensions offered by the picker and accepted by the drop zone. */
export const ACCEPTED_EXTENSIONS = '.md,.markdown,.txt';

export async function loadFile(file: File): Promise<LoadedFile> {
  return { source: await file.text(), fileName: file.name };
}
