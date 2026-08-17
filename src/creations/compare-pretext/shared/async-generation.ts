/** Guards lazy demo continuations that cannot be cancelled by the loader. */
export class AsyncGeneration {
  private generation = 0;
  private destroyed = false;

  next(): number {
    if (this.destroyed) return this.generation;
    return ++this.generation;
  }

  isCurrent(generation: number): boolean {
    return !this.destroyed && generation === this.generation;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
  }
}
