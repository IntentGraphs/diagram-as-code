import { describe, it, expect } from 'vitest';
import { render } from '../src/index.js';
import type { PositionedDiagram } from '@bpm/layout';

function activity(id: string, activityType: string, partial: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'activity' as const,
    label: id,
    activityType,
    collapsed: false,
    children: [],
    childEdges: [],
    x: 10,
    y: 10,
    width: 120,
    height: 60,
    ...partial,
  };
}

describe('task subtype markers', () => {
  const subtypes = [
    'userTask', 'serviceTask', 'sendTask', 'receiveTask',
    'manualTask', 'businessRuleTask', 'scriptTask',
  ] as const;

  for (const subtype of subtypes) {
    it(`renders a marker for ${subtype}`, () => {
      const diagram: PositionedDiagram = {
        pools: [],
        nodes: [activity(subtype, subtype)],
        edges: [],
      };
      const svg = render(diagram);
      expect(svg).toContain(`data-node-id="${subtype}"`);
      expect(svg).toMatch(/<circle|<rect|<path|<line|<polygon/);
    });
  }

  it('does not render a subtype marker on generic task', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [activity('t1', 'task')],
      edges: [],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="t1"');
    expect(svg).not.toContain('transform="translate(16,16)"');
  });
});
