import { afterEach, describe, expect, test } from 'bun:test';
import { Entity } from '@vectojs/core';
import { APPS } from '../src/apps';
import { CREATIONS } from '../src/registry';
import { AppCard } from '../src/ui/AppCard';
import { CreationCard } from '../src/ui/CreationCard';
import { Bed, layoutCardRows } from '../src/ui/Bed';
import { ContributionBanner } from '../src/ui/ContributionBanner';

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

  test('keeps preview semantics without intercepting the card pointer target', () => {
    const card = new CreationCard(300, CREATIONS[0], 1, () => {});
    const preview = card.children[0]?.children[0];

    expect(preview?.getA11yAttributes()).toEqual({
      tag: 'img',
      src: CREATIONS[0].preview?.src,
      alt: CREATIONS[0].preview?.alt,
      label: CREATIONS[0].preview?.alt,
      pointerEvents: 'none',
    });
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

describe('ContributionBanner', () => {
  test('occupies one full-width row and exposes a native repository link', () => {
    const banner = new ContributionBanner();
    banner.resizeTo(684);
    banner.setPosition(32, 420);

    expect(banner.width).toBe(684);
    expect(banner.height).toBe(92);
    expect(banner.getA11yAttributes()).toEqual({
      tag: 'a',
      role: 'link',
      label: 'Submit your creation',
      href: 'https://github.com/vectojs/vectojs-gallery',
      target: '_blank',
    });
    expect(banner.isPointInside(32, 420)).toBe(true);
    expect(banner.isPointInside(716, 512)).toBe(true);
  });

  test('stacks its action below the copy at compact widths', () => {
    const banner = new ContributionBanner();
    banner.resizeTo(280);

    expect(banner.width).toBe(280);
    expect(banner.height).toBe(124);
    expect(banner.isPointInside(280, 124)).toBe(true);
  });

  test('does not duplicate navigation for a projected anchor click', () => {
    let opened = 0;
    const bannerRuntime = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    const bannerOriginalWindow = bannerRuntime.window;
    bannerRuntime.window = {
      open: () => {
        opened++;
        return null;
      },
    } as Window & typeof globalThis;

    const banner = new ContributionBanner();
    banner.emit('click', { nativeEvent: { currentTarget: { tagName: 'A' } } });
    banner.emit('click', {});
    expect(opened).toBe(1);

    if (bannerOriginalWindow) bannerRuntime.window = bannerOriginalWindow;
    else delete bannerRuntime.window;
  });

  test('stays outside the creation grid at narrow and wide column counts', () => {
    const bed = new Bed(620, 900, () => {});
    bed.resize(620, 900, CREATIONS.slice(0, 3));
    const internals = bed as unknown as {
      scroll: { content: { children: Entity[] } };
    };
    const narrowBanner = internals.scroll.content.children.find(
      (child) => child.id === 'ContributionBanner',
    );
    const narrowCreations = internals.scroll.content.children.filter((child) =>
      child.id.startsWith('CreationCard:'),
    );

    expect(narrowBanner).toBeDefined();
    expect(narrowBanner?.x).toBe(28);
    expect(narrowBanner?.width).toBe(564);
    expect(narrowCreations.every((card) => card.y + card.height < (narrowBanner?.y ?? 0))).toBe(
      true,
    );
    expect(internals.scroll.content.children.some((child) => child.id === 'SubmitCard')).toBe(
      false,
    );

    bed.resize(1100, 900, CREATIONS.slice(0, 3));
    const wideBanner = internals.scroll.content.children.find(
      (child) => child.id === 'ContributionBanner',
    );
    expect(wideBanner?.x).toBe(32);
    expect(wideBanner?.width).toBe(1036);
  });
});
