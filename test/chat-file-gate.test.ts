import { describe, expect, test } from 'bun:test';
import { ACCEPTED_EXTENSIONS, isAcceptedFile } from '../src/creations/chat/parser';

/** A `File`-shaped stub: `isAcceptedFile` reads only `name`. */
function named(name: string): File {
  return { name } as File;
}

describe('isAcceptedFile gates the destructive load path', () => {
  test('accepts every extension the picker filter advertises', () => {
    // The two must agree, or the picker offers a file the loader then refuses.
    for (const ext of ACCEPTED_EXTENSIONS.split(',')) {
      expect(isAcceptedFile(named(`notes${ext}`))).toBe(true);
    }
  });

  test('accepts .md, .markdown and .txt', () => {
    expect(isAcceptedFile(named('README.md'))).toBe(true);
    expect(isAcceptedFile(named('README.markdown'))).toBe(true);
    expect(isAcceptedFile(named('notes.txt'))).toBe(true);
  });

  test('is case-insensitive — the OS decides the case, not the user', () => {
    expect(isAcceptedFile(named('README.MD'))).toBe(true);
    expect(isAcceptedFile(named('NOTES.Txt'))).toBe(true);
  });

  test('rejects the SVG that a dragged display formula hands over', () => {
    // The regression this gate exists for. `$$…$$` projects as
    // `<img draggable="true" src="data:image/svg+xml;base64,…">`, so dragging a
    // formula starts a native image drag whose payload is an SVG file named
    // `download.svg`. Dropped back over the reader it used to be read as Markdown
    // and REPLACE the open document with the text of its own rendering.
    expect(isAcceptedFile(named('download.svg'))).toBe(false);
  });

  test('rejects binaries that would load as mojibake', () => {
    for (const name of ['photo.png', 'scan.pdf', 'archive.zip', 'clip.mp4']) {
      expect(isAcceptedFile(named(name))).toBe(false);
    }
  });

  test('rejects an extensionless file', () => {
    expect(isAcceptedFile(named('LICENSE'))).toBe(false);
    expect(isAcceptedFile(named('Makefile'))).toBe(false);
  });

  test('matches the final extension, not one embedded in the stem', () => {
    // `.md` appearing mid-name must not smuggle a binary through.
    expect(isAcceptedFile(named('notes.md.png'))).toBe(false);
    expect(isAcceptedFile(named('report.txt.zip'))).toBe(false);
    expect(isAcceptedFile(named('my.md.notes.md'))).toBe(true);
  });

  test('a dotfile named exactly like an extension is not a match by accident', () => {
    // `.md` as a whole filename ends with `.md`, so this documents the edge
    // rather than asserting a guess: it IS accepted, and reading it is harmless.
    expect(isAcceptedFile(named('.md'))).toBe(true);
  });
});
