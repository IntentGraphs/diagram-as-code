import { describe, expect, it } from 'vitest';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { normalizeSequencePlacement } from '../src/sequencePlacement.js';

const diagram: Diagram = {
  pools: [{
    id: 'pool1', name: 'Quality', lanes: [{ id: 'lane1', name: 'QA', nodeIds: ['package', 'complete', 'assess'] }],
  }],
  nodes: [
    { kind: 'activity', id: 'package', label: 'Package', activityType: 'task', collapsed: false, children: [], childEdges: [] },
    { kind: 'gateway', id: 'complete', label: 'Complete?', gatewayType: 'exclusive' },
    { kind: 'activity', id: 'assess', label: 'Assess', activityType: 'task', collapsed: false, children: [], childEdges: [] },
  ],
  edges: [
    { id: 'forward', sourceId: 'package', targetId: 'complete', flowType: 'sequence' },
    { id: 'feedback', sourceId: 'complete', targetId: 'package', flowType: 'conditionalSequence' },
    { id: 'next', sourceId: 'complete', targetId: 'assess', flowType: 'sequence' },
  ],
};

const positioned: PositionedDiagram = {
  pools: [{ id: 'pool1', name: 'Quality', x: 0, y: 0, width: 900, height: 300, lanes: [] }],
  nodes: [
    { kind: 'activity', id: 'package', label: 'Package', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 300, y: 180, width: 180, height: 60 },
    { kind: 'gateway', id: 'complete', label: 'Complete?', gatewayType: 'exclusive', x: 100, y: 40, width: 50, height: 50 },
    { kind: 'activity', id: 'assess', label: 'Assess', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 500, y: 20, width: 180, height: 60 },
  ],
  edges: [
    { ...diagram.edges[0], points: [] },
    { ...diagram.edges[1], points: [] },
    { ...diagram.edges[2], points: [] },
  ],
};

describe('normalizeSequencePlacement', () => {
  it('keeps the declared forward edge ahead of the feedback edge in a cycle', () => {
    const result = normalizeSequencePlacement(diagram, positioned, { nodeGap: 40, branchGap: 25 });
    const packageNode = result.nodes.find((node) => node.id === 'package')!;
    const completeNode = result.nodes.find((node) => node.id === 'complete')!;
    const assessNode = result.nodes.find((node) => node.id === 'assess')!;
    expect(packageNode.x).toBeLessThan(completeNode.x);
    expect(completeNode.x).toBeLessThan(assessNode.x);
  });

  it('aligns ordinary same-lane sequence nodes to one Y baseline', () => {
    const result = normalizeSequencePlacement(diagram, positioned, { nodeGap: 40, branchGap: 25 });
    const packageNode = result.nodes.find((node) => node.id === 'package')!;
    const completeNode = result.nodes.find((node) => node.id === 'complete')!;
    const assessNode = result.nodes.find((node) => node.id === 'assess')!;
    expect(packageNode.y + packageNode.height / 2).toBe(completeNode.y + completeNode.height / 2);
    expect(completeNode.y + completeNode.height / 2).toBe(assessNode.y + assessNode.height / 2);
  });
});
