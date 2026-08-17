import { describe, expect, test } from 'bun:test';
import RichNoteDemo from '../src/creations/compare-pretext/demos/rich-note';
import JustificationDemo from '../src/creations/compare-pretext/demos/justification-comparison';
import MarkdownChatDemo from '../src/creations/compare-pretext/demos/markdown-chat';

const noop = (): void => {};

function installDom(): () => void {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const canvas = {
    style: { cssText: '' },
    setAttribute: noop,
    getContext: () => ({ measureText: () => ({ width: 40 }) }),
  };
  Object.assign(globalThis, {
    document: {
      createElement: () => canvas,
    },
    window: {
      addEventListener: noop,
      removeEventListener: noop,
    },
  });
  return () => {
    if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
    else globalThis.window = originalWindow;
  };
}

describe('Compare Pretext semantic controls', () => {
  test('Rich Note exposes a named width slider and keeps it pointer-transparent', () => {
    const restore = installDom();
    try {
      const demo = new RichNoteDemo();
      demo.resizeTo(960, 640);
      const slider = demo.children[1];
      expect(slider.getA11yAttributes()).toMatchObject({
        role: 'slider',
        label: 'Text width',
        pointerEvents: 'none',
      });
      expect(slider.isPointInside(0, 0)).toBe(false);
      slider.emit('change', { value: 360 });
      expect((demo as unknown as { bodyWidth: number }).bodyWidth).toBe(360);
      demo.destroy();
    } finally {
      restore();
    }
  });

  test('Justification exposes width and river controls with one change path', () => {
    const restore = installDom();
    try {
      const demo = new JustificationDemo();
      demo.resizeTo(1200, 700);
      const slider = demo.children[1];
      const toggle = demo.children[2];
      expect(slider.getA11yAttributes()).toMatchObject({
        role: 'slider',
        label: 'Column width',
        pointerEvents: 'none',
      });
      expect(toggle.getA11yAttributes()).toMatchObject({
        role: 'switch',
        label: 'Show rivers',
        pointerEvents: 'none',
      });
      slider.emit('change', { value: 380 });
      expect((demo as unknown as { colWidth: number }).colWidth).toBe(380);
      toggle.emit('click', {});
      expect((demo as unknown as { showRivers: boolean }).showRivers).toBe(false);
      demo.destroy();
    } finally {
      restore();
    }
  });

  test('Markdown chat delegates measured virtualization and list semantics to VirtualList', () => {
    const restore = installDom();
    try {
      const demo = new MarkdownChatDemo();
      demo.resizeTo(900, 700);
      const list = demo.children[0];
      expect(list.getA11yAttributes()).toMatchObject({
        role: 'list',
        label: 'Virtual list with 10000 items',
      });
      const descriptor = list.getDevtoolsDescriptor();
      expect(descriptor.kind).toBe('VirtualList');
      expect(list.children.length).toBeLessThan(100);
      demo.destroy();
    } finally {
      restore();
    }
  });
});
