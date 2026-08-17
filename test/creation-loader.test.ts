import { describe, expect, test } from 'bun:test';
import { CreationLoadCoordinator } from '../src/creation-loader';
import { CREATIONS } from '../src/registry';
import { BackChip } from '../src/ui/BackChip';
import { CreationStatus } from '../src/ui/CreationStatus';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('CreationLoadCoordinator', () => {
  test('exposes loading until a delayed import resolves', async () => {
    const coordinator = new CreationLoadCoordinator<string>();
    const pending = deferred<string>();
    const outcome = coordinator.load('studio', () => pending.promise);

    expect(coordinator.state).toEqual({ kind: 'loading', id: 'studio' });
    pending.resolve('entity');

    expect(await outcome).toEqual({ kind: 'loaded', value: 'entity' });
    expect(coordinator.state).toEqual({
      kind: 'loaded',
      id: 'studio',
      value: 'entity',
    });
  });

  test('records a rejected import and permits retrying the same id', async () => {
    const coordinator = new CreationLoadCoordinator<string>();
    const error = new Error('chunk unavailable');

    expect(await coordinator.load('studio', () => Promise.reject(error))).toEqual({
      kind: 'failed',
      error,
    });
    expect(coordinator.state).toEqual({ kind: 'failed', id: 'studio', error });

    expect(await coordinator.load('studio', () => Promise.resolve('retry entity'))).toEqual({
      kind: 'loaded',
      value: 'retry entity',
    });
  });

  test('does not publish a superseded import result or error', async () => {
    const coordinator = new CreationLoadCoordinator<string>();
    const first = deferred<string>();
    const firstOutcome = coordinator.load('studio', () => first.promise);
    const secondOutcome = coordinator.load('nexus', () => Promise.resolve('nexus entity'));

    expect(await secondOutcome).toEqual({
      kind: 'loaded',
      value: 'nexus entity',
    });
    first.reject(new Error('late failure'));

    expect(await firstOutcome).toEqual({ kind: 'superseded' });
    expect(coordinator.state).toEqual({
      kind: 'loaded',
      id: 'nexus',
      value: 'nexus entity',
    });
  });

  test('invalidates pending work when returning to catalog or destroying', async () => {
    const coordinator = new CreationLoadCoordinator<string>();
    const catalogPending = deferred<string>();
    const catalogOutcome = coordinator.load('studio', () => catalogPending.promise);
    coordinator.showCatalog();
    catalogPending.resolve('stale');
    expect(await catalogOutcome).toEqual({ kind: 'superseded' });
    expect(coordinator.state).toEqual({ kind: 'catalog' });

    const destroyPending = deferred<string>();
    const destroyOutcome = coordinator.load('nexus', () => destroyPending.promise);
    coordinator.destroy();
    destroyPending.resolve('stale');
    expect(await destroyOutcome).toEqual({ kind: 'superseded' });
  });
});

describe('creation loading chrome', () => {
  test('keeps Back exposed as a named native button', () => {
    const back = new BackChip(() => {});
    expect(back.getA11yAttributes()).toEqual({
      tag: 'button',
      role: 'button',
      label: 'Back to gallery',
    });
  });

  test('projects loading and failure while exposing Retry only on failure', () => {
    let retries = 0;
    const status = new CreationStatus(800, 600, CREATIONS[0], () => retries++);
    expect(status.getA11yAttributes()).toEqual({
      tag: 'div',
      role: 'status',
      label: `Loading ${CREATIONS[0].title}`,
    });
    expect(status.children).toHaveLength(0);

    status.setFailed();
    expect(status.getA11yAttributes()).toEqual({
      tag: 'div',
      role: 'status',
      label: `${CREATIONS[0].title} failed to load. Retry or return to the gallery.`,
    });
    expect(status.children).toHaveLength(1);
    expect(status.children[0].getA11yAttributes().role).toBe('button');
    status.children[0].emit('click', {});
    expect(retries).toBe(1);
  });
});
