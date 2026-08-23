import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode } from '../src/types.js';
import { overridePinnedNodes } from '../src/pinnedOverride.js';

function taskNode(id: string, label: string, position?: { x: number; y: number }) {
  return {
    kind: 'activity' as const, id, label, activityType: 'task' as const,
    collapsed: false, children: [], childEdges: [],
    ...(position ? { position } : {}),
  };
}

function positionedTask(id: string, x: number, y: number, w = 100, h = 60): PositionedNode {
  return {
    kind: 'activity', id, label: id, activityType: 'task', collapsed: false,
    children: [], childEdges: [], x, y, width: w, height: h,
  } as PositionedNode;
}

describe('overridePinnedNodes', () => {
  it('overrides only the pinned node position, leaving every other node untouched', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        taskNode('a', 'A', { x: 500, y: 500 }),
        taskNode('b', 'B'),
        taskNode('c', 'C'),
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence' },
        { id: 'e2', sourceId: 'b', targetId: 'c', flowType: 'sequence' },
      ],
    };
    const autoPositioned: PositionedDiagram = {
      pools: [],
      nodes: [
        positionedTask('a', 10, 10),
        positionedTask('b', 150, 10),
        positionedTask('c', 290, 10),
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        { id: 'e2', sourceId: 'b', targetId: 'c', flowType: 'sequence', points: [{ x: 2, y: 0 }, { x: 3, y: 0 }] },
      ],
    };

    const result = overridePinnedNodes(diagram, autoPositioned);
    expect(result.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 500, y: 500 });
    expect(result.nodes.find((n) => n.id === 'b')).toEqual(autoPositioned.nodes.find((n) => n.id === 'b'));
    expect(result.nodes.find((n) => n.id === 'c')).toEqual(autoPositioned.nodes.find((n) => n.id === 'c'));
  });

  it('re-routes an edge touching the pinned node but leaves other edges untouched', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [taskNode('a', 'A', { x: 500, y: 500 }), taskNode('b', 'B'), taskNode('c', 'C')],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence' },
        { id: 'e2', sourceId: 'b', targetId: 'c', flowType: 'sequence' },
      ],
    };
    const autoPositioned: PositionedDiagram = {
      pools: [],
      nodes: [positionedTask('a', 10, 10), positionedTask('b', 150, 10), positionedTask('c', 290, 10)],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 110, y: 40 }, { x: 150, y: 40 }] },
        { id: 'e2', sourceId: 'b', targetId: 'c', flowType: 'sequence', points: [{ x: 250, y: 40 }, { x: 290, y: 40 }] },
      ],
    };
    const result = overridePinnedNodes(diagram, autoPositioned);
    const e1 = result.edges.find((e) => e.id === 'e1')!;
    const e2 = result.edges.find((e) => e.id === 'e2')!;
    expect(e1.points).not.toEqual(autoPositioned.edges[0].points);
    expect(e1.points.length).toBeGreaterThanOrEqual(2);
    expect(e2.points).toEqual(autoPositioned.edges[1].points);
  });

  it('throws the shared actionable overlap error if the pinned override collides with a neighbor', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [taskNode('a', 'A', { x: 150, y: 10 }), taskNode('b', 'B')],
      edges: [],
    };
    const autoPositioned: PositionedDiagram = {
      pools: [],
      nodes: [positionedTask('a', 10, 10), positionedTask('b', 150, 10)],
      edges: [],
    };
    expect(() => overridePinnedNodes(diagram, autoPositioned)).toThrow(/shift ".*" (right|down) by \d+/);
  });

  it('resolves lane-relative pinned coordinates against the already-computed lane origin', () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['a', 'b'] }] }],
      nodes: [taskNode('a', 'A', { x: 40, y: 40 }), taskNode('b', 'B')],
      edges: [],
    };
    const autoPositioned: PositionedDiagram = {
      pools: [{
        id: 'p1', name: 'P', x: 0, y: 0, width: 400, height: 200,
        lanes: [{ id: 'l1', name: 'L', x: 30, y: 50, width: 350, height: 140 }],
      }],
      nodes: [positionedTask('a', 80, 90), positionedTask('b', 200, 90)],
      edges: [],
    };
    const result = overridePinnedNodes(diagram, autoPositioned);
    expect(result.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 70, y: 90 });
    expect(result.nodes.find((n) => n.id === 'b')).toEqual(autoPositioned.nodes.find((n) => n.id === 'b'));
  });
});
