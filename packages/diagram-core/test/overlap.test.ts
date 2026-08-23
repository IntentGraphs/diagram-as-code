import { describe, it, expect } from 'vitest';
import type { Bounds } from '../src/overlap.js';
import { assertNoOverlaps, describeOverlap } from '../src/overlap.js';

function box(id: string, x: number, y: number, width = 50, height = 50, children?: Bounds[]): Bounds {
  return { id, x, y, width, height, ...(children ? { children } : {}) };
}

describe('assertNoOverlaps', () => {
  it('throws the actionable shift message for a horizontal overlap', () => {
    expect(() => assertNoOverlaps([box('a', 0, 0), box('b', 40, 0)])).toThrow(
      /Nodes "a" and "b" overlap at their given positions — shift "b" right by 10 \(or the other node left\)/,
    );
  });

  it('does not throw for non-overlapping nodes', () => {
    expect(() => assertNoOverlaps([box('a', 0, 0), box('b', 100, 0)])).not.toThrow();
  });

  it('does not flag a parent and its own child as overlapping', () => {
    const child = box('c', 10, 10, 20, 20);
    const parent = box('p', 0, 0, 200, 200, [child]);
    expect(() => assertNoOverlaps([parent])).not.toThrow();
  });
});

describe('describeOverlap', () => {
  it('suggests shifting down when the vertical overlap is smaller', () => {
    const message = describeOverlap(box('a', 0, 0, 50, 50), box('b', 0, 40, 50, 50));
    expect(message).toBe('shift "b" down by 10 (or the other node up)');
  });
});
