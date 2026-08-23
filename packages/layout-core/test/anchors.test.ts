import { describe, it, expect } from 'vitest';
import { facingSides, outlineAnchor, sideOf, stubFrom } from '../src/anchors.js';

const rect = { x: 100, y: 100, width: 50, height: 40 };

describe('sideOf', () => {
  it('returns the midpoint of each border', () => {
    expect(sideOf(rect, 'left')).toEqual({ x: 100, y: 120 });
    expect(sideOf(rect, 'right')).toEqual({ x: 150, y: 120 });
    expect(sideOf(rect, 'top')).toEqual({ x: 125, y: 100 });
    expect(sideOf(rect, 'bottom')).toEqual({ x: 125, y: 140 });
  });

  it('applies a vertical delta to left/right/top/bottom consistently', () => {
    expect(sideOf(rect, 'left', 10)).toEqual({ x: 100, y: 130 });
    expect(sideOf(rect, 'top', 10)).toEqual({ x: 125, y: 110 });
  });
});

describe('stubFrom', () => {
  it('offsets outward from each side', () => {
    expect(stubFrom({ x: 100, y: 120 }, 'left', 14)).toEqual({ x: 86, y: 120 });
    expect(stubFrom({ x: 150, y: 120 }, 'right', 14)).toEqual({ x: 164, y: 120 });
    expect(stubFrom({ x: 125, y: 100 }, 'top', 14)).toEqual({ x: 125, y: 86 });
    expect(stubFrom({ x: 125, y: 140 }, 'bottom', 14)).toEqual({ x: 125, y: 154 });
  });
});

describe('visual docking helpers', () => {
  it('faces vertically stacked nodes on their top/bottom sides', () => {
    expect(facingSides(rect, { x: 100, y: 180, width: 50, height: 40 })).toEqual({ from: 'bottom', to: 'top' });
  });

  it('uses the circle outline rather than a box corner direction', () => {
    const event = { kind: 'event' as const, x: 100, y: 100, width: 40, height: 40 };
    expect(outlineAnchor(event, 'right', { x: 200, y: 140 })).toEqual({
      x: 139.40285000290663,
      y: 124.85071250072666,
    });
  });
});
