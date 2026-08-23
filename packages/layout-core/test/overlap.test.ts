import { describe, it, expect } from 'vitest';
import type { PositionedNode } from '../src/types.js';
import { assertNoOverlaps } from '../src/overlap.js';

function gate(id: string, x: number, y: number): PositionedNode {
  return {
    kind: 'gateway', id, label: id, gatewayType: 'exclusive',
    x, y, width: 50, height: 50,
  } as PositionedNode;
}

describe('assertNoOverlaps', () => {
  it('throws the actionable shift message for a horizontal overlap', () => {
    expect(() => assertNoOverlaps([gate('a', 0, 0), gate('b', 40, 0)])).toThrow(
      /Nodes "a" and "b" overlap at their given positions — shift "b" right by 10 \(or the other node left\)/,
    );
  });
});
