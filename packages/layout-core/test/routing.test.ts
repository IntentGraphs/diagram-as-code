import { describe, expect, it } from 'vitest';
import { validateWaypointPath } from '../src/routing/middleRoute.js';

describe('validateWaypointPath', () => {
  it('accepts orthogonal paths that clear obstacles', () => {
    expect(validateWaypointPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 20 }], [{ x: 10, y: 0, width: 10, height: 10 }]).valid).toBe(true);
  });

  it('rejects diagonal, non-finite, and obstacle-intersecting paths', () => {
    const result = validateWaypointPath([{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: Number.NaN, y: 20 }], [{ x: 5, y: 5, width: 20, height: 20 }]);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['diagonal-segment', 'non-finite', 'obstacle-intersection']));
  });
});
