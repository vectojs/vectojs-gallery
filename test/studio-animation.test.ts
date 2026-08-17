import { describe, expect, test } from 'bun:test';
import { Scene } from '@vectojs/core';
import CanvasStudio from '../src/creations/studio';

const noop = (): void => {};

function documentStub(): {
  getElementById: () => null;
  createElement: () => object;
} {
  return {
    getElementById: () => null,
    createElement: () => ({
      style: { cssText: '' },
      setAttribute: noop,
      getContext: () => ({ measureText: () => ({ width: 40 }) }),
    }),
  };
}

function rendererStub(): never {
  return new Proxy(
    {
      canvas: { width: 640, height: 480 },
      measureText: () => 40,
    },
    { get: (target, key) => Reflect.get(target, key) ?? noop },
  ) as never;
}

describe('Studio toast animation lifecycle', () => {
  test('Scene.step keeps the toast pending until its fade completes', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const listeners = { addEventListener: noop, removeEventListener: noop };

    Object.assign(globalThis, {
      document: documentStub(),
      window: listeners,
    });

    try {
      const studio = new CanvasStudio();
      delete (globalThis as { document?: Document }).document;
      const canvas = {
        width: 640,
        height: 480,
        style: {},
        parentElement: null,
        ...listeners,
      };
      const scene = new Scene(canvas as never, {
        renderer: rendererStub(),
        renderMode: 'onDemand',
        disableWindowResize: true,
        contentProjection: false,
      });
      studio.resizeTo(640, 480);
      scene.add(studio);

      const showToast = studio as unknown as {
        showToast(message: string): void;
      };
      showToast.showToast('Saved');
      expect(studio.hasPendingAnimations()).toBe(true);

      for (let frame = 0; frame < 39; frame++) scene.step(50);
      expect(studio.hasPendingAnimations()).toBe(true);

      scene.step(50);
      expect(studio.hasPendingAnimations()).toBe(false);
      scene.destroy();
    } finally {
      if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = originalDocument;
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else globalThis.window = originalWindow;
    }
  });
});

describe('Studio semantic controls and pointer transactions', () => {
  test('projects named toolbar controls without duplicating the canvas hit path', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const canvasListeners = new Map<string, (event: Event) => void>();
    const canvas = {
      width: 640,
      height: 480,
      style: {},
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      addEventListener: (type: string, listener: (event: Event) => void) =>
        canvasListeners.set(type, listener),
      removeEventListener: () => {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 640,
        height: 480,
      }),
    };
    const windowListeners = new Map<string, (event: Event) => void>();

    Object.assign(globalThis, {
      document: {
        ...documentStub(),
        getElementById: () => canvas,
      },
      window: {
        innerWidth: 640,
        innerHeight: 480,
        addEventListener: (type: string, listener: (event: Event) => void) =>
          windowListeners.set(type, listener),
        removeEventListener: () => {},
      },
    });

    try {
      const studio = new CanvasStudio();
      studio.resizeTo(640, 480);
      const workspace = studio.children[0];
      const addRect = studio.children[1];
      expect(workspace.getA11yAttributes()).toMatchObject({
        role: 'application',
        pointerEvents: 'none',
      });
      expect(addRect.getA11yAttributes()).toMatchObject({
        tag: 'button',
        label: 'Add rectangle',
        pointerEvents: 'none',
      });
      expect(addRect.isPointInside(0, 0)).toBe(false);

      addRect.emit('click', {});
      expect((studio as unknown as { shapes: unknown[] }).shapes).toHaveLength(4);
      addRect.emit('focus', {});
      expect((addRect as unknown as { focused: boolean }).focused).toBe(true);

      const pointerDown = canvasListeners.get('pointerdown');
      const pointerCancel = windowListeners.get('pointercancel');
      pointerDown?.({
        clientX: 420,
        clientY: 300,
        pointerId: 7,
      } as PointerEvent);
      pointerCancel?.({ pointerId: 7 } as PointerEvent);
      expect((studio as unknown as { activePointerId: number | null }).activePointerId).toBe(null);
      studio.destroy();
    } finally {
      if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = originalDocument;
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else globalThis.window = originalWindow;
    }
  });
});
