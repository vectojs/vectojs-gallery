import { Entity, Group, type A11yAttributes, type IRenderer } from '@vectojs/core';
import { COLOR, type Accent } from './tokens';

export const EDITORIAL_CARD_RADIUS = 14;
const MEDIA_RADIUS = 10;
const MEDIA_HOVER_SCALE = 1.025;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Shared interaction and visual shell for catalog cards. The card's outer box
 * is the semantic and pointer hit surface; hover motion is confined to a
 * clipped media child so animated geometry can never move the hit boundary.
 */
export abstract class EditorialCard extends Entity {
  protected hovered = false;
  protected focused = false;
  protected readonly mediaFrame = new Group();
  private mediaContent: Entity | null = null;
  private mediaX = 0;
  private mediaY = 0;
  private mediaWidth = 0;
  private mediaHeight = 0;

  protected constructor(
    id: string,
    protected readonly accent: Accent,
    onActivate: (event: unknown) => void,
    private readonly invalidate: () => void,
  ) {
    super(id);
    this.interactive = true;
    this.mediaFrame.id = `${id}:media`;
    this.mediaFrame.clipChildren = true;
    this.add(this.mediaFrame);

    this.on('hover', () => this.setHovered(true));
    this.on('pointerleave', () => this.setHovered(false));
    this.on('focus', () => this.setFocused(true));
    this.on('blur', () => this.setFocused(false));
    this.on('click', onActivate);
  }

  protected mountMedia(content: Entity): void {
    this.mediaContent = content;
    this.mediaFrame.add(content);
    this.applyMediaMotion();
  }

  protected resizeMediaFrame(x: number, y: number, width: number, height: number): void {
    this.mediaX = x;
    this.mediaY = y;
    this.mediaWidth = width;
    this.mediaHeight = height;
    this.mediaFrame.setPosition(x, y);
    this.mediaFrame.width = width;
    this.mediaFrame.height = height;
    this.applyMediaMotion();
  }

  protected mediaHoverFraction(): number {
    if (!this.mediaContent || prefersReducedMotion()) return this.hovered ? 1 : 0;
    return Math.max(0, Math.min(1, (this.mediaContent.scaleX - 1) / (MEDIA_HOVER_SCALE - 1)));
  }

  private setHovered(hovered: boolean): void {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.applyMediaMotion();
    this.invalidate();
  }

  private setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.invalidate();
  }

  private applyMediaMotion(): void {
    if (!this.mediaContent) return;
    const reducedMotion = prefersReducedMotion();
    const scale = this.hovered && !reducedMotion ? MEDIA_HOVER_SCALE : 1;
    const x = -(this.mediaWidth * (scale - 1)) / 2;
    const y = -(this.mediaHeight * (scale - 1)) / 2;
    if (reducedMotion) {
      this.mediaContent.setPosition(x, y);
      this.mediaContent.scaleX = scale;
      this.mediaContent.scaleY = scale;
      return;
    }
    if (
      !this.hovered &&
      !this.mediaContent._hasActiveDrivers() &&
      this.mediaContent.x === 0 &&
      this.mediaContent.y === 0 &&
      this.mediaContent.scaleX === 1 &&
      this.mediaContent.scaleY === 1
    ) {
      return;
    }
    this.mediaContent.springTo({ x, y, scaleX: scale, scaleY: scale });
  }

  override isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }

  abstract override getA11yAttributes(): A11yAttributes;

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, EDITORIAL_CARD_RADIUS);
    r.fill(COLOR.groundRaised);
    r.stroke(this.focused ? COLOR.ink : COLOR.rule, this.focused ? 2 : 1);

    r.beginPath();
    r.roundRect(this.mediaX, this.mediaY, this.mediaWidth, this.mediaHeight, MEDIA_RADIUS);
    r.fill(COLOR.groundSunk);
    r.stroke(this.hovered ? COLOR.ruleBright : COLOR.rule, 1);

    const barY = this.mediaY + this.mediaHeight + 8;
    const gradient = r.createLinearGradient(
      this.mediaX,
      barY,
      this.mediaX + this.mediaWidth,
      barY,
      [
        { stop: 0, color: this.accent.a },
        { stop: 1, color: this.accent.b },
      ],
    );
    r.beginPath();
    r.roundRect(this.mediaX, barY, this.mediaWidth, 3, 1.5);
    r.fill(gradient);
  }
}
