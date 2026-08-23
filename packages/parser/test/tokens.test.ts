import { describe, it, expect } from 'vitest';
import { isEdgeStyle, isEdgeCorner, isEdgeSide } from '../src/tokens.js';

describe('edge attribute token guards', () => {
  it('accepts known values and rejects unknown ones', () => {
    expect(isEdgeStyle('dashed')).toBe(true);
    expect(isEdgeStyle('squiggly')).toBe(false);
    expect(isEdgeCorner('round')).toBe(true);
    expect(isEdgeCorner('curvy')).toBe(false);
    expect(isEdgeSide('left')).toBe(true);
    expect(isEdgeSide('northwest')).toBe(false);
  });
});
