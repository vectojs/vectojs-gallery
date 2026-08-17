import { Entity, type A11yAttributes } from '@vectojs/core';

/**
 * Connects a control rendered by ThreeAdapter's detached Scene to the Gallery's
 * document-connected semantic projection. The visible control remains the only
 * state and activation owner; this entity only forwards semantic interaction.
 */
export class SemanticControlProxy extends Entity {
  constructor(
    private readonly label: string,
    private readonly control: Entity,
    width: number,
    height: number,
  ) {
    super(`DimensionSemantic:${label}`);
    this.width = width;
    this.height = height;
    this.interactive = true;

    this.on('click', (event) => this.control.emit('click', event));
    this.on('focus', (event) => this.control.emit('focus', event));
    this.on('blur', (event) => this.control.emit('blur', event));
  }

  override getA11yAttributes(): A11yAttributes {
    return {
      ...this.control.getA11yAttributes(),
      label: this.label,
      pointerEvents: 'none',
    };
  }

  override isPointInside(): boolean {
    return false;
  }

  override render(): void {
    // The corresponding control is visible in the ThreeAdapter texture.
  }
}
