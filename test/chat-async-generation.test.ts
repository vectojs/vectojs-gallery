import { describe, expect, test } from 'bun:test';
import { AsyncGeneration } from '../src/creations/chat/async-generation';

describe('AsyncGeneration', () => {
  test('supersedes an older overlapping operation', () => {
    const gate = new AsyncGeneration();
    const older = gate.next();
    const newer = gate.next();

    expect(gate.isCurrent(older)).toBe(false);
    expect(gate.isCurrent(newer)).toBe(true);
  });

  test('invalidates pending work when destroyed', () => {
    const gate = new AsyncGeneration();
    const pending = gate.next();
    gate.destroy();

    expect(gate.isCurrent(pending)).toBe(false);
    expect(gate.next()).toBe(pending + 1);
    expect(gate.isCurrent(pending + 1)).toBe(false);
  });

  test('a close continuation cannot publish after a newer generation starts', () => {
    const gate = new AsyncGeneration();
    const closeGeneration = gate.next();
    gate.next();

    expect(gate.isCurrent(closeGeneration)).toBe(false);
  });
});
