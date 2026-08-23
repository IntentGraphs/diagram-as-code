import { describe, it, expect } from 'vitest';
import { bendCount, classifySegmentInteraction, edgeLength, isOrthogonal, issueDetailsFor } from '../src/inspection.js';

describe('classifySegmentInteraction', () => {
  it('distinguishes proper crossings from collinear overlap', () => {
    expect(classifySegmentInteraction({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe('proper-crossing');
    expect(classifySegmentInteraction({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe('collinear-overlap');
  });
});

describe('edgeLength', () => {
  it('sums the Manhattan distance across every segment', () => {
    expect(edgeLength([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }])).toBe(40);
  });

  it('returns 0 for a single point', () => {
    expect(edgeLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('bendCount', () => {
  it('counts direction changes, ignoring collinear waypoints', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 60, y: 30 }];
    expect(bendCount(points)).toBe(2);
  });

  it('returns 0 for a straight line', () => {
    expect(bendCount([{ x: 0, y: 0 }, { x: 40, y: 0 }])).toBe(0);
  });
});

describe('isOrthogonal', () => {
  it('is true when every segment is axis-aligned', () => {
    expect(isOrthogonal([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }])).toBe(true);
  });

  it('is false when a segment moves on both axes at once', () => {
    expect(isOrthogonal([{ x: 0, y: 0 }, { x: 40, y: 30 }])).toBe(false);
  });
});

describe('issueDetailsFor', () => {
  it('extracts node ids from an overlap message', () => {
    const details = issueDetailsFor({
      nodeOverlaps: ['"A" (a) overlaps "B" (b)'],
      edgeThroughNode: [],
      edgeCrossings: 0,
      edgeOvershootsOwnEndpoint: [],
    });
    expect(details).toEqual([{ code: 'node_overlap', message: '"A" (a) overlaps "B" (b)', nodeIds: ['a', 'b'] }]);
  });

  it('extracts edge and node ids from an edge-through-node message', () => {
    const details = issueDetailsFor({
      nodeOverlaps: [],
      edgeThroughNode: ['edge e1 (a->b) passes through "Blocker" (blocker)'],
      edgeCrossings: 0,
      edgeOvershootsOwnEndpoint: [],
    });
    expect(details).toEqual([
      { code: 'edge_through_node', message: 'edge e1 (a->b) passes through "Blocker" (blocker)', edgeIds: ['e1'], nodeIds: ['a', 'b', 'blocker'] },
    ]);
  });

  it('reports a single aggregate detail for edge crossings', () => {
    const details = issueDetailsFor({ nodeOverlaps: [], edgeThroughNode: [], edgeCrossings: 2, edgeOvershootsOwnEndpoint: [] });
    expect(details).toEqual([{ code: 'edge_crossing', message: '2 edge-edge crossing(s) detected' }]);
  });

  it('returns an empty list when the analysis has no issues', () => {
    expect(issueDetailsFor({ nodeOverlaps: [], edgeThroughNode: [], edgeCrossings: 0, edgeOvershootsOwnEndpoint: [] })).toEqual([]);
  });
});
