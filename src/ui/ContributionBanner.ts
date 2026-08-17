import { Entity, type A11yAttributes, type IRenderer } from '@vectojs/core';
import { measureText } from '@vectojs/ui';
import { COLOR, FONT } from './tokens';

const REPO_URL = 'https://github.com/vectojs/vectojs-gallery';
const HEIGHT = 92;
const RADIUS = 14;

/** A full-width editorial invitation placed after the creation rows. */
export class ContributionBanner extends Entity {
  private hovered = false;
  private focused = false;

  constructor(private readonly invalidate: () => void = () => {}) {
    super('ContributionBanner');
    this.height = HEIGHT;
    this.interactive = true;

    this.on('hover', () => {
      this.hovered = true;
      this.invalidate();
    });
    this.on('pointerleave', () => {
      this.hovered = false;
      this.invalidate();
    });
    this.on('focus', () => {
      this.focused = true;
      this.invalidate();
    });
    this.on('blur', () => {
      this.focused = false;
      this.invalidate();
    });
    this.on('click', (event: unknown) => {
      const nativeTarget = (event as { nativeEvent?: { currentTarget?: { tagName?: string } } })
        .nativeEvent?.currentTarget;
      if (nativeTarget?.tagName === 'A') return;
      window.open(REPO_URL, '_blank', 'noopener,noreferrer');
    });
  }

  resizeTo(width: number): void {
    this.width = width;
    this.height = HEIGHT;
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      tag: 'a',
      role: 'link',
      label: 'Submit your creation',
      href: REPO_URL,
      target: '_blank',
    };
  }

  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, RADIUS);
    r.fill(this.hovered ? COLOR.groundRaised : COLOR.groundSunk);
    r.stroke(this.focused ? COLOR.ink : COLOR.ruleBright, this.focused ? 2 : 1);

    r.beginPath();
    r.roundRect(20, 20, 4, this.height - 40, 2);
    r.fill(COLOR.ink);

    const title = 'Have a creation to share?';
    const subtitle = 'Submit a canvas-native piece to the VectoJS gallery.';
    r.fillText(title, 40, 37, FONT.display(16), COLOR.textPrimary);
    r.fillText(subtitle, 40, 61, FONT.body(12), COLOR.textMuted);

    const action = 'Read the contribution guide  ↗';
    const actionWidth = measureText(action, FONT.mono(11));
    r.fillText(action, this.width - actionWidth - 24, 49, FONT.mono(11), COLOR.inkDim);
  }
}
