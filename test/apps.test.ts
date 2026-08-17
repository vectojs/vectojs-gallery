import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, displayUrl } from '../src/apps';

describe('forge app manifest', () => {
  test('declares intrinsic media dimensions, crop policy, and normalized focal point', () => {
    expect(APPS).toHaveLength(6);
    for (const app of APPS) {
      expect(app.screenshotMedia.width).toBeGreaterThan(0);
      expect(app.screenshotMedia.height).toBeGreaterThan(0);
      expect(['cover', 'contain']).toContain(app.screenshotMedia.fit);
      expect(app.screenshot).toStartWith('/apps/');
      const focal = app.screenshotMedia.focalPoint;
      if (focal) {
        expect(focal.x).toBeGreaterThanOrEqual(0);
        expect(focal.x).toBeLessThanOrEqual(1);
        expect(focal.y).toBeGreaterThanOrEqual(0);
        expect(focal.y).toBeLessThanOrEqual(1);
      }
    }
  });

  test('records the committed dimensions for every screenshot', () => {
    const dimensions = Object.fromEntries(
      APPS.map((app) => [app.id, [app.screenshotMedia.width, app.screenshotMedia.height]]),
    );
    expect(dimensions).toEqual({
      bakudan: [720, 450],
      brings: [1440, 780],
      motif: [1440, 780],
      numera: [1440, 780],
      unisol: [1440, 780],
      vem: [1440, 780],
    });
  });

  test('ids are unique and non-empty', () => {
    const ids = APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const app of APPS) {
      expect(app.id.length).toBeGreaterThan(0);
      expect(app.name.length).toBeGreaterThan(0);
      expect(app.tagline.length).toBeGreaterThan(0);
    }
  });

  test('urls are https', () => {
    for (const app of APPS) {
      expect(app.url.startsWith('https://')).toBe(true);
    }
  });

  test('every screenshot is committed under public/', () => {
    for (const app of APPS) {
      const file = join(import.meta.dir, '..', 'public', app.screenshot);
      expect(existsSync(file)).toBe(true);
    }
  });

  test('accents are hex color pairs', () => {
    for (const app of APPS) {
      expect(app.accent.a).toMatch(/^#[0-9a-f]{6}$/i);
      expect(app.accent.b).toMatch(/^#[0-9a-f]{6}$/i);
      expect(app.accent.glow).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('displayUrl strips protocol and trailing slash', () => {
    expect(displayUrl('https://vem.run/')).toBe('vem.run');
    expect(displayUrl('https://unisol.vectojs.org')).toBe('unisol.vectojs.org');
  });

  test('apps are ordered alphabetically by name', () => {
    const names = APPS.map((a) => a.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
