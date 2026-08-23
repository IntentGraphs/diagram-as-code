import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents } from '@bpm/layout-core';
import { flatEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await flatEngine.layout(diagram));
}

describe('flat engine', () => {
  it('assigns coordinates and size to every node, and routes every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);

    expect(positioned.nodes).toHaveLength(2);
    for (const node of positioned.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    expect(positioned.edges).toHaveLength(1);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('recursively lays out an expanded subprocess\'s children within its own bounds', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          children: [
            { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true },
            { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
          ],
          childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };

    const positioned = await layout(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;

    expect(sp1.children).toHaveLength(2);
    const sn1 = sp1.children!.find((n) => n.id === 'sn1')!;
    const sn2 = sp1.children!.find((n) => n.id === 'sn2')!;
    for (const child of [sn1, sn2]) {
      expect(child.x).toBeGreaterThanOrEqual(sp1.x);
      expect(child.y).toBeGreaterThanOrEqual(sp1.y);
      expect(child.x + child.width).toBeLessThanOrEqual(sp1.x + sp1.width);
      expect(child.y + child.height).toBeLessThanOrEqual(sp1.y + sp1.height);
    }
    expect(sp1.childEdges).toHaveLength(1);
    const firstPoint = sp1.childEdges![0].points[0];
    expect(firstPoint.x).toBe(sn1.x + sn1.width);
    expect(firstPoint.y).toBe(sn1.y + sn1.height / 2);
  });

  it('positions a nested boundary event on its host and restores its outgoing child edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          children: [
            { kind: 'activity', id: 'sn1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
            { kind: 'event', id: 'be1', label: 'Payment failed', category: 'intermediate', trigger: 'error', interrupting: true, attachedToId: 'sn1' },
            { kind: 'activity', id: 'sn2', label: 'Handle failure', activityType: 'task', collapsed: false, children: [], childEdges: [] },
          ],
          childEdges: [{ id: 'ie1', sourceId: 'be1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };

    const positioned = await layout(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;

    expect(sp1.children?.map((n) => n.id)).toEqual(['sn1', 'sn2', 'be1']);

    const sn1 = sp1.children!.find((n) => n.id === 'sn1')!;
    const be1 = sp1.children!.find((n) => n.id === 'be1')!;
    expect(be1.x).toBeGreaterThanOrEqual(sn1.x);
    expect(be1.x).toBeLessThanOrEqual(sn1.x + sn1.width);
    expect(Math.abs(be1.y + be1.height / 2 - (sn1.y + sn1.height))).toBeLessThan(1);

    expect(sp1.childEdges?.map((e) => e.id)).toEqual(['ie1']);
    expect(sp1.childEdges![0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('positions boundary events on their host activity\'s border and routes their outgoing edges', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
        { kind: 'activity', id: 't2', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 't2', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    const b1 = positioned.nodes.find((n) => n.id === 'b1')!;

    expect(b1.x).toBeGreaterThanOrEqual(t1.x);
    expect(b1.x).toBeLessThanOrEqual(t1.x + t1.width);
    expect(Math.abs(b1.y + b1.height / 2 - (t1.y + t1.height))).toBeLessThan(1);

    const routedEdge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(routedEdge.points.length).toBeGreaterThanOrEqual(2);
  });

  it('routes an edge that points into a boundary event', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Await approval', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Reminder', category: 'intermediate', trigger: 'message', interrupting: false, attachedToId: 't1' },
        { kind: 'activity', id: 't2', label: 'Send reminder', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 't2', targetId: 'b1', flowType: 'message' }],
    };

    const positioned = await layout(diagram);
    const b1 = positioned.nodes.find((n) => n.id === 'b1')!;
    const routedEdge = positioned.edges.find((e) => e.id === 'e1');

    expect(routedEdge).toBeDefined();
    expect(routedEdge!.points.length).toBeGreaterThanOrEqual(2);
    const end = routedEdge!.points[routedEdge!.points.length - 1];
    expect(end.x).toBe(b1.x);
    expect(end.y).toBe(b1.y + b1.height / 2);
  });

  it('routes an edge that leaves an expanded sub-process', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          children: [
            { kind: 'activity', id: 'sn1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
          ],
          childEdges: [],
        },
        { kind: 'event', id: 'end1', label: 'Done', category: 'end', trigger: 'none', interrupting: true },
      ],
      edges: [{ id: 'e1', sourceId: 'sn1', targetId: 'end1', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
  });
});
