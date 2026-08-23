import { describe, expect, it } from 'vitest';
import { inspectLayout } from '../src/index.js';

describe('inspectLayout', () => {
  it('returns absolute node geometry and route statistics', () => {
    const positioned = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'a', label: 'A', activityType: 'task', collapsed: false, children: [], x: 10, y: 20, width: 100, height: 60 },
        { kind: 'activity', id: 'b', label: 'B', activityType: 'task', collapsed: false, children: [], x: 210, y: 20, width: 100, height: 60 },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 110, y: 50 }, { x: 210, y: 50 }] }],
    } as any;

    const result = inspectLayout(positioned);
    expect(result.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(result.edges[0]).toMatchObject({ length: 100, bendCount: 0, orthogonal: true });
    expect(result.metrics).toEqual({ edgeCrossings: 0, nodeOverlaps: 0, edgeThroughNode: 0, edgeOvershootsOwnEndpoint: 0, routeFallbacks: 0 });
    expect(result.issueDetails).toEqual([]);
    expect(result.renderBounds).toEqual({ x: 0, y: 0, width: 350, height: 120 });
  });

  it('counts direction changes rather than collinear waypoint points as bends', () => {
    const positioned = {
      pools: [],
      nodes: [],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 60, y: 30 },
      ] }],
    } as any;
    expect(inspectLayout(positioned).edges[0]).toMatchObject({ length: 90, bendCount: 2, orthogonal: true });
  });

  it('returns machine-readable issue identities', () => {
    const positioned = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'a', label: 'A', activityType: 'task', collapsed: false, children: [], x: 0, y: 0, width: 50, height: 50 },
        { kind: 'activity', id: 'b', label: 'B', activityType: 'task', collapsed: false, children: [], x: 200, y: 0, width: 50, height: 50 },
        { kind: 'activity', id: 'blocker', label: 'Blocker', activityType: 'task', collapsed: false, children: [], x: 90, y: 0, width: 50, height: 50 },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 50, y: 25 }, { x: 200, y: 25 }] }],
    } as any;
    expect(inspectLayout(positioned).issueDetails).toEqual([
      expect.objectContaining({ code: 'edge_through_node', edgeIds: ['e1'], nodeIds: ['a', 'b', 'blocker'] }),
    ]);
  });
});
