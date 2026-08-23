import { describe, it, expect } from 'vitest';
import type { DiagramNode } from '@bpm/ast';
import { toElkGraph, toElkNode, toElkChildren, collectOrigins, positionNode, routeEdges, runElkLayout, sizeOf } from '../src/index.js';

describe('layout-elk-base shared exports', () => {
  it('uses only control-flow edges for ELK ranking', () => {
    const graph = toElkGraph({
      pools: [],
      nodes: [
        { kind: 'activity', id: 'a', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'dataObject', id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'sequence', sourceId: 'a', targetId: 'b', flowType: 'sequence' },
        { id: 'association', sourceId: 'd', targetId: 'b', flowType: 'association' },
        { id: 'message', sourceId: 'a', targetId: 'd', flowType: 'message' },
      ],
    });

    expect(graph.edges.map((edge: { id: string }) => edge.id)).toEqual(['sequence']);
  });

  it('preserves and routes omitted relationship edges after ELK layout', async () => {
    const positioned = await runElkLayout({
      pools: [],
      nodes: [
        { kind: 'activity', id: 'a', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'dataObject', id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'sequence', sourceId: 'a', targetId: 'b', flowType: 'sequence' },
        { id: 'association', sourceId: 'd', targetId: 'b', flowType: 'association' },
      ],
    });

    const data = positioned.nodes.find((node) => node.id === 'd')!;
    const target = positioned.nodes.find((node) => node.id === 'b')!;
    expect(positioned.edges.map((edge) => edge.id)).toEqual(['sequence', 'association']);
    expect(positioned.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(data.x + data.width).toBeLessThanOrEqual(target.x);
  });

  it('toElkNode sizes a leaf activity', () => {
    const node: DiagramNode = { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] };
    const elkNode = toElkNode(node);
    expect(elkNode).toEqual({ id: 't1', width: 100, height: 60 });
  });

  it('toElkChildren filters out boundary events', () => {
    const nodes: DiagramNode[] = [
      { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
    ];
    expect(toElkChildren(nodes).map((n) => n.id)).toEqual(['t1']);
  });

  it('collectOrigins records absolute offsets recursively', () => {
    const origins = new Map<string, { x: number; y: number }>();
    collectOrigins([{ id: 'a', x: 10, y: 5, children: [{ id: 'b', x: 1, y: 2 }] }], 100, 200, origins);
    expect(origins.get('a')).toEqual({ x: 110, y: 205 });
    expect(origins.get('b')).toEqual({ x: 111, y: 207 });
  });

  it('positionNode applies the offset to a leaf node', () => {
    const astNode: DiagramNode = { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] };
    const positioned = positionNode(astNode, { id: 't1', x: 5, y: 5, width: 100, height: 60 }, 10, 20, new Map());
    expect(positioned.x).toBe(15);
    expect(positioned.y).toBe(25);
  });

  it('sizeOf returns the standard per-kind pixel dimensions', () => {
    expect(sizeOf({ kind: 'event', id: 'e1', label: 'Start', category: 'start', trigger: 'none', interrupting: true })).toEqual({ width: 40, height: 40 });
    expect(sizeOf({ kind: 'gateway', id: 'g1', label: 'X', gatewayType: 'exclusive' })).toEqual({ width: 50, height: 50 });
    expect(sizeOf({ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] })).toEqual({ width: 100, height: 60 });
  });

  it('sizes wrapped and Unicode activity labels using the render contract', () => {
    const node: DiagramNode = { kind: 'activity', id: 't1', label: '处理订单 🚚 完成并通知客户以及所有相关参与者和审批人以及财务和运营团队确认后归档流程', activityType: 'task', collapsed: false, children: [], childEdges: [] };
    expect(sizeOf(node).height).toBeGreaterThan(60);
  });

  it('propagates direction to root and nested subprocess ELK graphs', () => {
    const graph = toElkGraph({
      direction: 'up', pools: [], nodes: [{
        kind: 'activity', id: 'sp', label: 'Process', activityType: 'subProcess', collapsed: false,
        children: [{ kind: 'activity', id: 'child', label: 'Child', activityType: 'task', collapsed: false, children: [], childEdges: [] }], childEdges: [],
      }], edges: [],
    });
    expect(graph.layoutOptions?.['elk.direction']).toBe('UP');
    expect(graph.children[0].layoutOptions?.['elk.direction']).toBe('UP');
  });

  it('routeEdges maps section points through the given offset', () => {
    const astEdge = { id: 'e1', sourceId: 's', targetId: 't', flowType: 'sequence' as const };
    const routed = routeEdges(
      [{ id: 'e1', sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } }] }],
      new Map([['e1', astEdge]]),
      new Map(),
      { x: 5, y: 5 },
    );
    expect(routed[0].points).toEqual([{ x: 5, y: 5 }, { x: 15, y: 5 }]);
  });
});
