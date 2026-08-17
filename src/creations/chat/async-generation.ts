/**
 * Generation guard for asynchronous work owned by a disposable creation.
 *
 * A completion can still run after its owner has been destroyed because the
 * underlying promise cannot be cancelled. Consumers must check `isCurrent`
 * before publishing its result or starting another asynchronous operation.
 */
export class AsyncGeneration {
  private generation = 0;
  private destroyed = false;

  next(): number {
    if (this.destroyed) return this.generation;
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return !this.destroyed && generation === this.generation;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation += 1;
  }
}
