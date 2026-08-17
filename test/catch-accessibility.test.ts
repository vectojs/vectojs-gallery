import { describe, expect, test } from 'bun:test';
import CatchGame from '../src/creations/catch';

const noop = (): void => {};

function installDom(): {
  restore: () => void;
  canvas: Record<string, unknown>;
} {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const canvas = {
    width: 800,
    height: 600,
    style: {},
    addEventListener: noop,
    removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  Object.assign(globalThis, {
    document: {
      getElementById: () => canvas,
      createElement: () => ({
        style: { cssText: '' },
        setAttribute: noop,
        getContext: () => ({ measureText: () => ({ width: 40 }) }),
      }),
    },
    window: {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: noop,
      removeEventListener: noop,
    },
  });
  return {
    canvas,
    restore: () => {
      if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = originalDocument;
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else globalThis.window = originalWindow;
    },
  };
}

describe('Fruit Catch semantic game controls', () => {
  test('projects a focused game region, live status, and mutually exclusive actions', () => {
    const dom = installDom();
    try {
      const game = new CatchGame();
      game.setSize(800, 600);
      const [workspace, status, start, restart] = game.children;

      expect(workspace.getA11yAttributes()).toMatchObject({
        role: 'application',
        pointerEvents: 'none',
      });
      expect(status.getA11yAttributes()).toMatchObject({ role: 'status' });
      expect(start.getA11yAttributes()).toMatchObject({
        tag: 'button',
        label: 'Start',
      });
      expect(start.interactive).toBe(true);
      expect(restart.interactive).toBe(false);

      start.emit('click', {});
      expect(game.phase).toBe('play');
      expect(start.interactive).toBe(false);
      expect(restart.interactive).toBe(true);
      expect(status.getA11yAttributes().label).toContain('in progress');

      restart.emit('click', {});
      expect(game.phase).toBe('ready');
      expect(status.getA11yAttributes().label).toContain('ready');
      game.destroy();
    } finally {
      dom.restore();
    }
  });

  test('scopes arrow-key movement to the focused game region', () => {
    const dom = installDom();
    try {
      const game = new CatchGame();
      game.setSize(800, 600);
      game.begin();
      const workspace = game.children[0];
      const keydown = (game as unknown as { onKeyDown: (event: KeyboardEvent) => void }).onKeyDown;
      const keyup = (game as unknown as { onKeyUp: (event: KeyboardEvent) => void }).onKeyUp;

      keydown({ key: 'ArrowRight', preventDefault: noop } as KeyboardEvent);
      game.update(100);
      expect(game.keyDir).toBe(0);

      workspace.emit('focus', {});
      keydown({ key: 'ArrowRight', preventDefault: noop } as KeyboardEvent);
      expect(game.keyDir).toBe(1);
      keyup({ key: 'ArrowRight' } as KeyboardEvent);
      expect(game.keyDir).toBe(0);
      game.destroy();
    } finally {
      dom.restore();
    }
  });
});
