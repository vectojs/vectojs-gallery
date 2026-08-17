export type CreationLoadState<T> =
  | { readonly kind: 'catalog' }
  | { readonly kind: 'loading'; readonly id: string }
  | { readonly kind: 'loaded'; readonly id: string; readonly value: T }
  | { readonly kind: 'failed'; readonly id: string; readonly error: unknown };

export type CreationLoadOutcome<T> =
  | { readonly kind: 'loaded'; readonly value: T }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'superseded' };

/** Owns lazy-import generations without coupling them to Scene or browser state. */
export class CreationLoadCoordinator<T> {
  private generation = 0;
  private destroyed = false;
  state: CreationLoadState<T> = { kind: 'catalog' };

  showCatalog(): void {
    if (this.destroyed) return;
    this.generation++;
    this.state = { kind: 'catalog' };
  }

  async load(id: string, loader: () => Promise<T>): Promise<CreationLoadOutcome<T>> {
    if (this.destroyed) return { kind: 'superseded' };
    const generation = ++this.generation;
    this.state = { kind: 'loading', id };

    try {
      const value = await loader();
      if (this.destroyed || generation !== this.generation) return { kind: 'superseded' };
      this.state = { kind: 'loaded', id, value };
      return { kind: 'loaded', value };
    } catch (error: unknown) {
      if (this.destroyed || generation !== this.generation) return { kind: 'superseded' };
      this.state = { kind: 'failed', id, error };
      return { kind: 'failed', error };
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
  }
}
