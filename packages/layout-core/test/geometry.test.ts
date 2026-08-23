import { describe, it, expect } from 'vitest';
import { analyzeLayout } from '../test-utils/geometry.js';
import { analyzeLayout as analyzeFromPublic } from '../src/index.js';
import type { PositionedDiagram, PositionedNode } from '../src/types.js';

function node(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id'>): PositionedNode {
  return { kind: 'activity', label: '', activityType: 'task', collapsed: false, x: 0, y: 0, width: 40, height: 40, ...partial } as PositionedNode;
}

describe('analyzeLayout', () => {
  it('reports no issues for two non-overlapping nodes with a clean edge', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 100, y: 0 })],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }] }],
    };
    const result = analyzeLayout(diagram);
    expect(result).toEqual({ nodeOverlaps: [], edgeThroughNode: [], edgeCrossings: 0, edgeOvershootsOwnEndpoint: [] });
  });

  it('reports a node overlap', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 10, y: 10 })],
    };
    expect(analyzeLayout(diagram).nodeOverlaps).toHaveLength(1);
  });

  it('reports an edge passing through an unrelated node', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 200, y: 0 }), node({ id: 'c', x: 100, y: 0 })],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 200, y: 20 }] }],
    };
    expect(analyzeLayout(diagram).edgeThroughNode).toHaveLength(1);
  });

  it('reports edge-edge crossings', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [
        node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 100, y: 100 }),
        node({ id: 'c', x: 0, y: 100 }), node({ id: 'd', x: 100, y: 0 }),
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 20, y: 20 }, { x: 120, y: 120 }] },
        { id: 'e2', sourceId: 'c', targetId: 'd', flowType: 'sequence', points: [{ x: 20, y: 120 }, { x: 120, y: 20 }] },
      ],
    };
    expect(analyzeLayout(diagram).edgeCrossings).toBe(1);
  });

  it('does not flag a boundary event straddling its host, or an edge legitimately inside its own container', () => {
    const host = node({ id: 'h', x: 0, y: 0, width: 100, height: 60 });
    const boundary = node({ id: 'b', x: 80, y: 40, width: 20, height: 20, attachedToId: 'h' } as any);
    const child = node({ id: 'c', x: 10, y: 110, width: 20, height: 20 });
    const parent = node({
      id: 'p', x: 0, y: 100, width: 200, height: 150,
      children: [child],
      childEdges: [{ id: 'ie1', sourceId: 'c', targetId: 'c', flowType: 'sequence', points: [{ x: 20, y: 120 }, { x: 30, y: 130 }] }],
    } as any);
    const diagram: PositionedDiagram = { pools: [], nodes: [host, boundary, parent], edges: [] };
    const result = analyzeLayout(diagram);
    expect(result.nodeOverlaps).toEqual([]);
    expect(result.edgeThroughNode).toEqual([]);
  });

  it('detects overlap for nested children using absolute diagram coordinates (no parent offset added)', () => {
    const child = node({ id: 'c', x: 10, y: 110, width: 20, height: 20 });
    const parent = node({
      id: 'p', x: 0, y: 100, width: 200, height: 150,
      children: [child],
    } as any);
    const overlapping = node({ id: 'o', x: 15, y: 115, width: 20, height: 20 });
    const diagram: PositionedDiagram = { pools: [], nodes: [parent, overlapping], edges: [] };
    const overlaps = analyzeLayout(diagram).nodeOverlaps;
    expect(overlaps.some((o) => o.includes('(c)') && o.includes('(o)'))).toBe(true);
  });

  it('flags an edge whose final segment cuts through its own target node to reach a far-side border', () => {
    // Anchor point (100,20) sits on target's LEFT border, but the segment arrives from the
    // right (x=200) at the same y — meaning it travels across target's own 100-150 x-range
    // (which is well inside its 100-150 interior) before reaching that border.
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [
        node({ id: 'source', x: 0, y: 0, width: 40, height: 40 }),
        node({ id: 'target', x: 100, y: 0, width: 50, height: 40 }),
      ],
      edges: [{
        id: 'e1', sourceId: 'source', targetId: 'target', flowType: 'sequence',
        points: [{ x: 40, y: 20 }, { x: 200, y: 20 }, { x: 100, y: 20 }],
      }],
    };
    const result = analyzeLayout(diagram);
    expect(result.edgeOvershootsOwnEndpoint).toHaveLength(1);
    expect(result.edgeOvershootsOwnEndpoint[0]).toContain('e1');
    expect(result.edgeOvershootsOwnEndpoint[0]).toContain('target');
  });

  it('does not flag a normal edge that approaches its target border from the correct outside direction', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [
        node({ id: 'source', x: 0, y: 0, width: 40, height: 40 }),
        node({ id: 'target', x: 100, y: 0, width: 50, height: 40 }),
      ],
      edges: [{
        id: 'e1', sourceId: 'source', targetId: 'target', flowType: 'sequence',
        points: [{ x: 40, y: 20 }, { x: 100, y: 20 }],
      }],
    };
    const result = analyzeLayout(diagram);
    expect(result.edgeOvershootsOwnEndpoint).toEqual([]);
  });

  it('exports analyzeLayout from the package public entry', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 100, y: 0 })],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }] }],
    };
    const analysis = analyzeFromPublic(diagram);
    expect(analysis).toEqual(analyzeLayout(diagram));
    expect(analysis).toHaveProperty('edgeCrossings');
    expect(analysis).toHaveProperty('nodeOverlaps');
    expect(analysis).toHaveProperty('edgeThroughNode');
  });
});
