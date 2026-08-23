import { describe, it, expect } from 'vitest';
import type { Diagram, EventNode, GatewayNode, ActivityNode, DataObjectNode, DiagramEdge } from '../src/index.js';

describe('Diagram AST v2 shape', () => {
  it('supports every node kind and every flow type', () => {
    const start: EventNode = { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true };
    const boundary: EventNode = { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' };
    const gateway: GatewayNode = { kind: 'gateway', id: 'g1', label: 'Approved?', gatewayType: 'inclusive' };
    const subProcess: ActivityNode = {
      kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
      children: [{ kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true }],
      childEdges: [],
    };
    const dataObject: DataObjectNode = { kind: 'dataObject', id: 'd1', label: 'Invoice' };
    const edge: DiagramEdge = { id: 'e1', sourceId: 'n1', targetId: 'g1', flowType: 'conditionalSequence' };

    const diagram: Diagram = {
      pools: [],
      nodes: [start, boundary, gateway, subProcess, dataObject],
      edges: [edge],
    };

    expect(diagram.nodes).toHaveLength(5);
    expect((diagram.nodes[3] as ActivityNode).children).toHaveLength(1);
    expect(diagram.edges[0].flowType).toBe('conditionalSequence');
  });

  it('supports node positions, edge style overrides, and manual positioning mode', () => {
    const t1: ActivityNode = {
      kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false,
      children: [], childEdges: [], position: { x: 40, y: 40 },
    };
    const edge: DiagramEdge = {
      id: 'e1', sourceId: 't1', targetId: 't1', flowType: 'sequence',
      style: 'dashed', corner: 'round', from: 'right', to: 'top',
    };
    const diagram: Diagram = { pools: [], nodes: [t1], edges: [edge], positioning: 'manual' };

    expect(diagram.positioning).toBe('manual');
    expect(diagram.nodes[0]).toMatchObject({ position: { x: 40, y: 40 } });
    expect(diagram.edges[0]).toMatchObject({ style: 'dashed', corner: 'round', from: 'right', to: 'top' });
  });
});
