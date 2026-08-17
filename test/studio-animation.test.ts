import { describe, expect, test } from 'bun:test';
import { Scene } from '@vectojs/core';
import CanvasStudio from '../src/creations/studio';

const noop = (): void => {};

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
      document: { getElementById: () => null },
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
