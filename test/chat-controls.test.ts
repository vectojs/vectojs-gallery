import { afterEach, describe, expect, test } from 'bun:test';
import { ControlPanel } from '../src/creations/chat/ControlPanel';
import { DropZone } from '../src/creations/chat/DropZone';
import { SearchBar } from '../src/creations/chat/SearchBar';

function installDocumentStub(): void {
  const body = { appendChild() {}, removeChild() {} };
  const createElement = (tag: string) => {
    const listeners = new Map<string, () => void>();
    const element = {
      tagName: tag.toUpperCase(),
      style: {} as Record<string, string>,
      value: '',
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      },
      removeEventListener() {},
      remove() {},
      focus() {},
      blur() {},
      select() {},
      setAttribute() {},
    };
    if (tag === 'canvas') {
      Object.assign(element, {
        getContext: () => ({
          measureText: () => ({ width: 40 }),
        }),
      });
    }
    return element;
  };
  globalThis.document = {
    body,
    activeElement: null,
    createElement,
  } as unknown as Document;
}

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

describe('Stream Reader semantic controls', () => {
  test('ControlPanel exposes separate named buttons and a token-rate slider', () => {
    installDocumentStub();
    const calls: string[] = [];
    const panel = new ControlPanel({
      onFileOpen: () => calls.push('file'),
      onPlay: () => calls.push('play'),
      onPause: () => calls.push('pause'),
      onStop: () => calls.push('clean'),
      onToggleLoop: () => calls.push('loop'),
      onRateChange: (value) => calls.push(`rate:${value}`),
    });

    const attrs = panel.semanticControls.map((control) => control.getA11yAttributes());
    expect(panel.getA11yAttributes().pointerEvents).toBe('none');
    expect(panel.panelHeight).toBe(124);
    panel.width = 1000;
    expect(panel.panelHeight).toBe(124);
    expect(attrs.map((value) => value.label)).toEqual([
      'Token rate value',
      'Token rate slider',
      'Open file',
      'Play',
      'Pause',
      'Clean',
      'Toggle loop',
    ]);
    expect(attrs[0]?.pointerEvents).toBeUndefined();
    expect(attrs.slice(1).every((value) => value.pointerEvents !== 'none')).toBe(true);

    panel.semanticControls[3]?.emit('click');
    panel.semanticControls[1]?.emit('change', { value: 240 });
    expect(calls).toEqual(['play', 'rate:240']);
    panel.destroy();
  });

  test('SearchBar exposes independent previous, next, and close semantics', () => {
    installDocumentStub();
    const calls: string[] = [];
    const search = new SearchBar({
      onQuery: () => {},
      onPrev: () => calls.push('prev'),
      onNext: () => calls.push('next'),
      onClose: () => calls.push('close'),
    });

    expect(search.semanticControls.map((button) => button.getA11yAttributes().label)).toEqual([
      'Previous match',
      'Next match',
      'Close search',
    ]);
    expect(
      search.semanticControls.every(
        (button) => button.getA11yAttributes().pointerEvents === 'none',
      ),
    ).toBe(true);
    expect(search.semanticControls.every((button) => button.interactive)).toBe(false);

    globalThis.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    search.open();
    search.query = 'canvas';
    search.setResults(3, 1);
    expect(search.resultStatus.getA11yAttributes()).toMatchObject({
      role: 'status',
      label: 'Search result 2 of 3',
      pointerEvents: 'none',
    });
    expect(search.semanticControls.every((button) => button.interactive)).toBe(true);
    search.semanticControls[0]?.emit('click');
    search.semanticControls[1]?.emit('click');
    search.semanticControls[2]?.emit('click');
    expect(calls).toEqual(['prev', 'next', 'close']);
    search.destroy();
    delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame })
      .requestAnimationFrame;
  });

  test('DropZone stays clickable while visible, transparent once hidden', () => {
    const zone = new DropZone(() => {});

    // Entity clicks only arrive through the projected mirror — the Scene wires
    // no canvas-level click dispatch — so a visible DropZone must be
    // hit-testable or the "Click to open file" affordance is dead. Every
    // sibling control projects above it (buttons z18+, PerfPanel z23, BackChip
    // z25 vs this entity's z14), so they remain reachable wherever their boxes
    // overlap. Hidden (document loaded), the same box would block text
    // selection over the transcript, so it reports nothing at all.
    expect(zone.getA11yAttributes()).toEqual({
      role: 'button',
      label: 'Open a Markdown or text file',
      pointerEvents: 'auto',
    });

    zone.visible = false;
    expect(zone.getA11yAttributes()).toEqual({ pointerEvents: 'none' });
    expect(zone.interactive).toBe(false);
    zone.destroy();
  });
});
