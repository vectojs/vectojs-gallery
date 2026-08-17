import { afterEach, describe, expect, test } from 'bun:test';
import { Entity } from '@vectojs/core';
import { APPS } from '../src/apps';
import { CREATIONS } from '../src/registry';
import { AppCard } from '../src/ui/AppCard';
import { CreationCard } from '../src/ui/CreationCard';
import { layoutCardRows } from '../src/ui/Bed';

const runtime = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
};
const originalWindow = runtime.window;

afterEach(() => {
  if (originalWindow) runtime.window = originalWindow;
  else delete runtime.window;
});

function setReducedMotion(matches: boolean): void {
  runtime.window = {
    matchMedia: (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' && matches,
      }) as MediaQueryList,
  } as Window & typeof globalThis;
}

describe('EditorialCard', () => {
  test('projects a named native button and activates through its click path', () => {
    let opened = '';
    const card = new CreationCard(300, CREATIONS[0], 1, (creation) => {
      opened = creation.id;
    });

    expect(card.getA11yAttributes()).toEqual({
      tag: 'button',
      role: 'button',
      label: `Open ${CREATIONS[0].title}`,
    });
    card.emit('click', {});
    expect(opened).toBe(CREATIONS[0].id);
  });

  test('projects forge apps as links without duplicating native link navigation', () => {
    let opened = 0;
    runtime.window = {
      matchMedia: () => ({ matches: false }) as MediaQueryList,
      open: () => {
        opened++;
        return null;
      },
    } as Window & typeof globalThis;
    const card = new AppCard(360, APPS[0]);

    expect(card.getA11yAttributes()).toEqual({
      tag: 'a',
      role: 'link',
      label: `Open ${APPS[0].name}`,
      href: APPS[0].url,
      target: '_blank',
    });
    card.emit('click', { nativeEvent: { currentTarget: { tagName: 'A' } } });
    expect(opened).toBe(0);
    card.emit('click', {});
    expect(opened).toBe(1);
  });

  test('keeps the semantic hit surface fixed while only media animates', () => {
    setReducedMotion(false);
    const card = new CreationCard(300, CREATIONS[0], 1, () => {});
    card.setPosition(30, 42);
    const media = card.children[0];
    const content = media.children[0];

    expect(card.isPointInside(31, 43)).toBe(true);
    card.emit('hover', {});

    expect(card.x).toBe(30);
    expect(card.y).toBe(42);
    expect(card._hasActiveDrivers()).toBe(false);
    expect(content._hasActiveDrivers()).toBe(true);
    expect(card.isPointInside(31, 43)).toBe(true);
  });

  test('removes media motion when reduced motion is requested', () => {
    setReducedMotion(true);
    const card = new CreationCard(300, CREATIONS[0], 1, () => {});
    const content = card.children[0].children[0];

    card.emit('hover', {});

    expect(content.scaleX).toBe(1);
    expect(content.scaleY).toBe(1);
    expect(content._hasActiveDrivers()).toBe(false);
  });

  test('tracks focus independently and invalidates state changes', () => {
    let invalidations = 0;
    const card = new CreationCard(
      300,
      CREATIONS[0],
      1,
      () => {},
      () => invalidations++,
    );
    const state = card as unknown as { focused: boolean };

    card.emit('focus', {});
    expect(state.focused).toBe(true);
    card.emit('blur', {});
    expect(state.focused).toBe(false);
    expect(invalidations).toBe(2);
  });
});

describe('layoutCardRows', () => {
  test('equalizes within each row instead of using one global height', () => {
    const cells = [40, 60, 90, 120].map((height, index) => {
      const cell = new Entity(`cell-${index}`);
      cell.width = 100;
      cell.height = height;
      return cell;
    });

    layoutCardRows(cells, 2, 100, 10, (cell, height) => {
      cell.height = height;
    });

    expect(cells.map((cell) => cell.height)).toEqual([60, 60, 120, 120]);
    expect(cells.map((cell) => cell.y)).toEqual([10, 10, 86, 86]);
  });
});
