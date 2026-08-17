import { Entity, type IRenderer } from '@vectojs/core';
import { COLOR, FONT } from './tokens';

/**
 * A section title + one-line subtitle, used to separate the Creations and
 * Built-on-VectoJS bands of the hub. Fixed height so the Bed's flow layout
 * can position sections without measuring.
 */
export class SectionHeader extends Entity {
  private readonly eyebrow: string;

  constructor(
    width: number,
    private readonly title: string,
    private readonly subtitle: string,
    eyebrow = title === 'Creations' ? '01 / SHOWCASE' : '02 / FORGE',
  ) {
    super(`SectionHeader:${title}`);
    this.width = width;
    this.eyebrow = eyebrow;
    this.height = 76;
  }

  resizeTo(width: number): void {
    this.width = width;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const subtitle = this.width < 520 ? compactSubtitle(this.title) : this.subtitle;
    r.fillText(this.eyebrow, 0, 13, FONT.mono(10), COLOR.inkDim);
    r.fillText(this.title, 0, 39, FONT.display(22), COLOR.textPrimary);
    r.fillText(subtitle, 0, 63, FONT.body(13), COLOR.textMuted);
    r.beginPath();
    r.moveTo(0, 75);
    r.lineTo(Math.min(this.width, 96), 75);
    r.stroke(COLOR.ruleBright, 1);
  }
}

export function compactSubtitle(title: string): string {
  return title === 'Creations' ? 'Live, canvas-native pieces.' : 'Applications built on VectoJS.';
}
