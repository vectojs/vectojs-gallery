import { describe, expect, test } from 'bun:test';
import { Button, Toggle } from '@vectojs/ui';
import { SemanticControlProxy } from '../src/creations/dimension/semantic-control-proxy';

describe('Dimension semantic control proxies', () => {
  test('shares button activation between raycast and connected semantic paths', () => {
    let activations = 0;
    const button = new Button('+', { onClick: () => activations++ });
    const proxy = new SemanticControlProxy('Increase particle count', button, 48, 48);

    button.emit('click', {});
    proxy.emit('click', {});

    expect(activations).toBe(2);
    expect(proxy.getA11yAttributes()).toEqual({
      tag: 'button',
      role: 'button',
      label: 'Increase particle count',
      disabled: undefined,
      pointerEvents: 'none',
    });
    expect(proxy.isPointInside(1, 1)).toBe(false);
  });

  test('reflects toggle state after keyboard-equivalent semantic activation', () => {
    let value = false;
    const toggle = new Toggle({
      label: 'Floor grid',
      checked: false,
      onChange: (checked) => {
        value = checked;
      },
    });
    const proxy = new SemanticControlProxy('Floor grid', toggle, 160, 40);

    proxy.emit('click', {});

    expect(value).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(proxy.getA11yAttributes()).toEqual({
      role: 'switch',
      checked: true,
      label: 'Floor grid',
      pointerEvents: 'none',
    });
  });

  test('forwards focus state to the visible 3D control', () => {
    const button = new Button('−');
    const proxy = new SemanticControlProxy('Decrease particle count', button, 48, 48);

    proxy.emit('focus', {});
    expect(button.focused).toBe(true);

    proxy.emit('blur', {});
    expect(button.focused).toBe(false);
  });
});
