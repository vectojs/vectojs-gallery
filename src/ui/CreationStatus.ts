import { Entity, type A11yAttributes, type IRenderer } from '@vectojs/core';
import { Button } from '@vectojs/ui';
import type { Creation } from '../registry';
import { accentFor, COLOR, FONT } from './tokens';

export type CreationStatusKind = 'loading' | 'failed';

const PANEL_MAX_WIDTH = 520;

export class CreationStatus extends Entity {
  private readonly retryButton: Button;
  private status: CreationStatusKind = 'loading';

  constructor(
    width: number,
    height: number,
    private readonly creation: Creation,
    onRetry: () => void,
  ) {
    super(`CreationStatus:${creation.id}`);
    this.width = width;
    this.height = height;
    this.retryButton = new Button('Retry', {
      font: FONT.body(14),
      bg: COLOR.groundRaised,
      color: COLOR.textPrimary,
      padding: 10,
      radius: 10,
      onClick: onRetry,
    });
    this.layoutRetry();
  }

  setFailed(): void {
    this.status = 'failed';
    if (!this.retryButton.parent) this.add(this.retryButton);
    this.scene?.markDirty();
  }

  resizeTo(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layoutRetry();
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      tag: 'div',
      role: 'status',
      label:
        this.status === 'loading'
          ? `Loading ${this.creation.title}`
          : `${this.creation.title} failed to load. Retry or return to the gallery.`,
    };
  }

  private layoutRetry(): void {
    const panelWidth = Math.min(PANEL_MAX_WIDTH, Math.max(240, this.width - 48));
    const panelX = (this.width - panelWidth) / 2;
    const panelY = Math.max(72, (this.height - 230) / 2);
    this.retryButton.setPosition(panelX + 28, panelY + 158);
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    const panelWidth = Math.min(PANEL_MAX_WIDTH, Math.max(240, this.width - 48));
    const panelHeight = this.status === 'failed' ? 230 : 190;
    const x = (this.width - panelWidth) / 2;
    const y = Math.max(72, (this.height - panelHeight) / 2);
    const accent = accentFor(this.creation.id);

    r.beginPath();
    r.roundRect(x, y, panelWidth, panelHeight, 20);
    r.fill('rgba(253, 252, 250, 0.96)');
    r.stroke('rgba(216, 208, 194, 0.72)', 1);

    r.beginPath();
    r.roundRect(x + 28, y + 28, 44, 4, 2);
    r.fill(
      r.createLinearGradient(x + 28, y + 28, x + 72, y + 28, [
        { stop: 0, color: accent.a },
        { stop: 1, color: accent.b },
      ]),
    );

    const eyebrow = this.status === 'loading' ? 'OPENING CREATION' : 'CREATION UNAVAILABLE';
    const title =
      this.status === 'loading' ? `Loading ${this.creation.title}` : 'The import did not load';
    const summary =
      this.status === 'loading'
        ? 'Preparing the canvas and its runtime.'
        : 'You can retry this creation or return to the gallery.';
    r.fillText(eyebrow, x + 28, y + 56, FONT.mono(10), COLOR.textFaint);
    r.fillText(title, x + 28, y + 94, FONT.display(22), COLOR.textPrimary);
    r.fillText(summary, x + 28, y + 126, FONT.body(14), COLOR.textMuted);
  }
}
