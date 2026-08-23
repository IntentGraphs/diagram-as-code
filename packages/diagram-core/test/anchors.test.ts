import { describe, it, expect } from 'vitest';
import { facingSides, outlineAnchor, outlinePort, sideOf, sidePort, stubFrom } from '../src/anchors.js';

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

describe('sidePort', () => {
  it('keeps the center at zero and mirrors symmetric offsets', () => {
    expect(sidePort(rect, 'right', 0)).toEqual({ x: 150, y: 120 });
    expect(sidePort(rect, 'right', -10)).toEqual({ x: 150, y: 110 });
    expect(sidePort(rect, 'right', 10)).toEqual({ x: 150, y: 130 });
    expect(sidePort(rect, 'top', -10)).toEqual({ x: 115, y: 100 });
    expect(sidePort(rect, 'top', 10)).toEqual({ x: 135, y: 100 });
  });

  it('clamps offsets to the side ends, including small shapes', () => {
    expect(sidePort(rect, 'left', 100)).toEqual({ x: 100, y: 140 });
    expect(sidePort(rect, 'top', -100)).toEqual({ x: 100, y: 100 });
    expect(sidePort({ x: 0, y: 0, width: 0, height: 0 }, 'right', 10)).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic for repeated calls', () => {
    const ports = Array.from({ length: 3 }, () => sidePort(rect, 'bottom', 7));
    expect(ports).toEqual([{ x: 132, y: 140 }, { x: 132, y: 140 }, { x: 132, y: 140 }]);
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

describe('outlinePort', () => {
  it('keeps rectangular offsets on the requested border', () => {
    expect(outlinePort(rect, 'right', 'rect', 10)).toEqual({ x: 150, y: 130 });
  });

  it('projects gateway ports onto the diamond outline', () => {
    const diamond = { x: 100, y: 100, width: 50, height: 50 };
    const point = outlinePort(diamond, 'right', 'diamond', 10);
    expect(point.x).toBeLessThan(150);
    expect(point.y).toBeCloseTo(132.14, 1);
  });

  it('projects event ports onto the circle outline', () => {
    const circle = { x: 100, y: 100, width: 40, height: 40 };
    const point = outlinePort(circle, 'left', 'circle', 6);
    expect(point.x).toBeGreaterThan(100);
    expect(point.y).toBeCloseTo(125.75, 1);
  });
});

describe('facingSides', () => {
  it('faces vertically stacked nodes on their top/bottom sides', () => {
    expect(facingSides(rect, { x: 100, y: 180, width: 50, height: 40 })).toEqual({ from: 'bottom', to: 'top' });
  });

  it('faces horizontally spaced nodes on their left/right sides', () => {
    expect(facingSides(rect, { x: 300, y: 100, width: 50, height: 40 })).toEqual({ from: 'right', to: 'left' });
  });
});

describe('outlineAnchor', () => {
  it('falls back to the rect border midpoint for shape "rect" (the default)', () => {
    expect(outlineAnchor(rect, 'right')).toEqual(sideOf(rect, 'right'));
  });

  it('uses the circle outline rather than a box corner direction', () => {
    const circle = { x: 100, y: 100, width: 40, height: 40 };
    expect(outlineAnchor(circle, 'right', 'circle', { x: 200, y: 140 })).toEqual({
      x: 139.40285000290663,
      y: 124.85071250072666,
    });
  });

  it('uses the diamond outline rather than a box corner direction', () => {
    const diamond = { x: 100, y: 100, width: 40, height: 40 };
    const point = outlineAnchor(diamond, 'right', 'diamond', { x: 200, y: 140 });
    // The diamond outline in this direction sits strictly inside the bounding-box corner.
    expect(point.x).toBeLessThan(140);
    expect(point.y).toBeLessThan(140);
    expect(point.x).toBeGreaterThan(120);
  });

  it('applies delta to the rect before computing the anchor', () => {
    expect(outlineAnchor(rect, 'left', 'rect', undefined, 10)).toEqual({ x: 100, y: 130 });
  });
});
