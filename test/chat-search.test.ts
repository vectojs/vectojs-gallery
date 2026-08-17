import { describe, expect, test } from 'bun:test';
import type { Entity } from '@vectojs/core';
import { collectDocumentText, findMatches, lineAt } from '../src/creations/chat/search';

type FakeProjection = {
  text: string;
  contentY?: number;
  lines?: Array<{
    text: string;
    y?: number;
    lineHeight?: number;
    separatorAfter?: string;
  }>;
};

function fakeEntity(y: number, projection: FakeProjection | null, children: Entity[] = []): Entity {
  return {
    y,
    children,
    getContentProjection: () => projection,
  } as unknown as Entity;
}

describe('collectDocumentText', () => {
  test('collects rendered lines and accumulated entity offsets', () => {
    const root = fakeEntity(0, null, [
      fakeEntity(10, null, [
        fakeEntity(4, {
          text: 'hello world',
          lines: [
            { text: 'hello ', y: 2, lineHeight: 18, separatorAfter: ' ' },
            { text: 'world', y: 20, lineHeight: 18 },
          ],
        }),
      ]),
      fakeEntity(40, { text: 'second block' }),
    ]);

    const doc = collectDocumentText(root);

    expect(doc.text).toBe('hello  world\nsecond block');
    expect(doc.lines).toEqual([
      { start: 0, end: 6, y: 16, height: 18 },
      { start: 7, end: 12, y: 34, height: 18 },
      { start: 13, end: 25, y: 40, height: 20 },
    ]);
  });
});

describe('findMatches', () => {
  const doc = {
    text: 'Alpha beta\nGamma beta',
    lines: [
      { start: 0, end: 10, y: 12, height: 20 },
      { start: 11, end: 21, y: 48, height: 22 },
    ],
  };

  test('matches case-insensitively and resolves each match to a line', () => {
    expect(findMatches(doc, 'BETA')).toEqual([
      { index: 6, length: 4, y: 12, height: 20 },
      { index: 17, length: 4, y: 48, height: 22 },
    ]);
  });

  test('returns no matches for an empty query', () => {
    expect(findMatches(doc, '   ')).toEqual([]);
  });

  test('does not return overlapping occurrences', () => {
    expect(
      findMatches({ text: 'aaaa', lines: [{ start: 0, end: 4, y: 0, height: 20 }] }, 'aa'),
    ).toEqual([
      { index: 0, length: 2, y: 0, height: 20 },
      { index: 2, length: 2, y: 0, height: 20 },
    ]);
  });
});

describe('lineAt', () => {
  const doc = {
    text: 'one\ntwo',
    lines: [
      { start: 0, end: 3, y: 10, height: 20 },
      { start: 4, end: 7, y: 40, height: 20 },
    ],
  };

  test('returns the preceding line for a separator offset', () => {
    expect(lineAt(doc, 3)?.y).toBe(10);
  });

  test('returns undefined before the first line', () => {
    expect(lineAt(doc, -1)).toBeUndefined();
  });
});
