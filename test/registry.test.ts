import { describe, expect, test } from 'bun:test';
import { CREATIONS } from '../src/registry';

describe('creation registry', () => {
  test('ids are unique and non-empty', () => {
    const ids = CREATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CREATIONS) expect(c.id.length).toBeGreaterThan(0);
  });

  test('creations are ordered alphabetically by title', () => {
    const titles = CREATIONS.map((c) => c.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  test('Stream Reader stays on the continuous display-cadence pump', () => {
    const chat = CREATIONS.find((creation) => creation.id === 'chat');
    expect(chat?.continuousRedraw).toBe(true);
  });

  test('representative creations expose stable intrinsic previews', () => {
    const expectedIds = ['studio', 'dimension', 'catch', 'nexus', 'compare-pretext', 'chat'];
    const previews = new Map(CREATIONS.map((creation) => [creation.id, creation.preview]));

    for (const id of expectedIds) {
      const preview = previews.get(id);
      expect(preview).toBeDefined();
      expect(preview?.src).toBe(`/previews/${id}.svg`);
      expect(preview?.width).toBeGreaterThan(0);
      expect(preview?.height).toBeGreaterThan(0);
      expect(preview?.alt.length).toBeGreaterThan(10);
    }
  });

  test('preview identity is keyed by creation id, not registry position', () => {
    const reordered = [...CREATIONS].reverse();
    const byId = new Map(CREATIONS.map((creation) => [creation.id, creation.preview?.src]));

    for (const creation of reordered) {
      expect(creation.preview?.src).toBe(byId.get(creation.id));
    }
  });
});
