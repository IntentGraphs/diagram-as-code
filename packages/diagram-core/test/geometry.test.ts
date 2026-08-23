import { describe, it, expect } from 'vitest';
import { segmentIntersectsRect, inflateRect, rectsOverlap, segmentsIntersect, overshootsAnchor } from '../src/geometry.js';

describe('segmentIntersectsRect', () => {
  it('detects a horizontal segment passing through a rect', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(segmentIntersectsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, rect)).toBe(true);
  });

  it('returns false for a segment that passes well outside a rect', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 40, y: 0 }, rect)).toBe(false);
  });

  it('returns false for a segment that only grazes within the margin', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    // Segment runs along y=11, within the default 3px margin of the rect's top edge (y=10).
    expect(segmentIntersectsRect({ x: 0, y: 11 }, { x: 40, y: 11 }, rect)).toBe(false);
  });

  it('returns false when margins shrink the rect to zero or negative size', () => {
    const rect = { x: 10, y: 10, width: 4, height: 4 };
    expect(segmentIntersectsRect({ x: 0, y: 12 }, { x: 40, y: 12 }, rect, 3, 3)).toBe(false);
  });
});

describe('inflateRect', () => {
  it('expands a rect by the margin on every side', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(inflateRect(rect, 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 });
  });
});

describe('rectsOverlap', () => {
  it('reports overlap for rects sharing interior area beyond the margin', () => {
    const a = { x: 0, y: 0, width: 40, height: 40 };
    const b = { x: 10, y: 10, width: 40, height: 40 };
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it('does not report overlap for rects separated on the x axis', () => {
    const a = { x: 0, y: 0, width: 40, height: 40 };
    const b = { x: 100, y: 0, width: 40, height: 40 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it('treats rects that merely touch (within the default margin) as non-overlapping', () => {
    const a = { x: 0, y: 0, width: 40, height: 40 };
    const b = { x: 40, y: 0, width: 40, height: 40 };
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe('segmentsIntersect', () => {
  it('detects two segments crossing in an X shape', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });

  it('returns false for parallel non-intersecting segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it('returns false for segments that only share an endpoint', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(false);
  });
});

describe('overshootsAnchor', () => {
  const rect = { x: 100, y: 0, width: 50, height: 40 };

  it('flags an approach that crosses the rect interior to reach the anchor border', () => {
    // Anchor sits on the rect's left border; the approach point is further right, so the
    // segment must have crossed the rect's interior (100-150) to arrive at x=100.
    expect(overshootsAnchor(rect, { x: 200, y: 20 }, { x: 100, y: 20 })).toBe(true);
  });

  it('does not flag an approach arriving from outside the anchor border', () => {
    expect(overshootsAnchor(rect, { x: 40, y: 20 }, { x: 100, y: 20 })).toBe(false);
  });

  it('returns false when the anchor point is not on any border', () => {
    expect(overshootsAnchor(rect, { x: 200, y: 20 }, { x: 120, y: 20 })).toBe(false);
  });
});
