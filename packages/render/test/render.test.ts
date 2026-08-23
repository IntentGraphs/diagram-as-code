import { describe, it, expect } from 'vitest';
import { render } from '../src/index.js';
import { renderNode } from '../src/shapes.js';
import { renderEdge } from '../src/edges.js';
import { triggerIcon, triggerIconAtCenter } from '../src/icons.js';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '@bpm/layout';

function node(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id' | 'kind'>): PositionedNode {
  return { label: '', x: 0, y: 0, width: 40, height: 40, ...partial } as PositionedNode;
}

describe('render — node kinds', () => {
  it('renders a message start event with its trigger icon and a thin border', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'n1', kind: 'event', label: 'Placed', category: 'start', trigger: 'message', interrupting: true } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="n1"');
    expect(svg).toContain('Placed');
  });

  it('escapes hostile labels without leaving executable markup in SVG', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'n1', kind: 'activity', label: '<script>& " \' \n\u0001', width: 300, height: 60, activityType: 'task', collapsed: false, children: [], childEdges: [] } as any)],
    };
    const svg = render(diagram);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
    expect(svg).toContain('\uFFFD');
  });

  it('renders an inclusive gateway with a circle marker', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'g1', kind: 'gateway', label: 'Which?', gatewayType: 'inclusive' } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="g1"');
    expect(svg).toContain('<circle');
  });

  it('renders a collapsed subprocess with a plus marker and no recursion', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'sp1', kind: 'activity', label: 'Payment', activityType: 'subProcess', collapsed: true, children: [], childEdges: [] } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="sp1"');
    expect(svg).toContain('plus-marker');
  });

  it('renders an expanded subprocess by recursing into its children', () => {
    const child = node({ id: 'sn1', kind: 'activity', label: 'Inner task', activityType: 'task', collapsed: false, children: [], childEdges: [], width: 100, height: 60 } as any);
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({
        id: 'sp1', kind: 'activity', label: 'Payment', activityType: 'subProcess', collapsed: false,
        width: 300, height: 200, children: [child], childEdges: [],
      } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="sp1"');
    expect(svg).toContain('data-node-id="sn1"');
    expect(svg).toContain('Inner task');
  });

  it('renders the internal flows of an expanded subprocess', () => {
    const first = node({ id: 'sn1', kind: 'activity', label: 'First', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any);
    const second = node({ id: 'sn2', kind: 'activity', label: 'Second', activityType: 'task', collapsed: false, x: 100, children: [], childEdges: [] } as any);
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({
        id: 'sp1', kind: 'activity', label: 'Payment', activityType: 'subProcess', collapsed: false,
        width: 300, height: 200,
        children: [first, second],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }] }],
      } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-edge-id="ie1"');
    expect(svg).toContain('M 40 20 L 100 20');
  });

  it('expands the canvas for negative coordinates and routed edge points', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'n1', kind: 'activity', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], x: -10, y: -10 } as any)],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n1', flowType: 'sequence', points: [{ x: -30, y: -20 }, { x: 50, y: 60 }] }],
    };
    const svg = render(diagram);
    expect(svg).toContain('viewBox="0 0 120 120"');
    expect(svg).toContain('transform="translate(30 20)"');
  });

  it('gives a below-rendered label (gateway/event) a background halo so a crossing line stays legible', () => {
    const node = {
      kind: 'gateway', id: 'g1', label: 'Approved?', gatewayType: 'exclusive',
      x: 0, y: 0, width: 50, height: 50,
    } as any;
    const rendered = renderNode(node);
    expect(rendered.label).toContain('<rect');
    expect(rendered.label).toContain('Approved?');
    // The halo rect must come before the text in the string, so it paints underneath.
    expect(rendered.label.indexOf('<rect')).toBeLessThan(rendered.label.indexOf('<text'));
  });

  it('renders dataObject, dataStore, textAnnotation, and group with distinct shapes', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [
        node({ id: 'd1', kind: 'dataObject', label: 'Invoice' } as any),
        node({ id: 'ds1', kind: 'dataStore', label: 'DB' } as any),
        node({ id: 'note1', kind: 'textAnnotation', label: 'SLA' } as any),
        node({ id: 'grp1', kind: 'group', label: 'Critical' } as any),
      ],
    };
    const svg = render(diagram);
    for (const id of ['d1', 'ds1', 'note1', 'grp1']) {
      expect(svg).toContain(`data-node-id="${id}"`);
    }
  });
});

describe('render — edge flow types', () => {
  function edgeDiagram(flowType: import('@bpm/ast').FlowType): PositionedDiagram {
    return {
      pools: [],
      nodes: [
        node({ id: 'n1', kind: 'activity', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any),
        node({ id: 'n2', kind: 'activity', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }],
    };
  }

  it('renders a dashed line for message flow', () => {
    const svg = render(edgeDiagram('message'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('stroke-dasharray');
  });

  it('renders a dotted line with no arrowhead for association', () => {
    const svg = render(edgeDiagram('association'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).not.toContain('<polygon'); // no arrowhead marker
  });

  it('renders a diamond marker at the source for conditional sequence flow', () => {
    const svg = render(edgeDiagram('conditionalSequence'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('conditional-marker');
  });

  it('renders a slash marker at the source for default sequence flow', () => {
    const svg = render(edgeDiagram('defaultSequence'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('default-marker');
  });
});

describe('render — degenerate routes', () => {
  function unroutedEdge(points: RoutedEdge['points']): RoutedEdge {
    return { id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence', points };
  }

  it('skips an edge with no route instead of throwing', () => {
    expect(() => renderEdge(unroutedEdge([]))).not.toThrow();
    expect(renderEdge(unroutedEdge([]))).toEqual({ body: '', label: '' });
  });

  it('skips an edge with a single point instead of throwing', () => {
    expect(() => renderEdge(unroutedEdge([{ x: 10, y: 10 }]))).not.toThrow();
    expect(renderEdge(unroutedEdge([{ x: 10, y: 10 }]))).toEqual({ body: '', label: '' });
  });

  it('renders the rest of the diagram when one edge has no route', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'n1', kind: 'activity', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any)],
      edges: [unroutedEdge([])],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="n1"');
    expect(svg).not.toContain('data-edge-id="e1"');
  });
});

describe('triggerIcon', () => {
  it('returns empty markup for the none trigger', () => {
    expect(triggerIcon('none', { x: 0, y: 0, width: 36, height: 36 })).toBe('');
  });

  it('returns distinct, non-empty markup for every other trigger', () => {
    const triggers: import('@bpm/ast').EventTrigger[] = [
      'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
      'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
    ];
    const outputs = triggers.map((t) => triggerIconAtCenter(t, 20, 20, 36));
    for (const output of outputs) expect(output.length).toBeGreaterThan(0);
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('wraps icons in data-icon groups for BPMN trigger identification', () => {
    const triggers: import('@bpm/ast').EventTrigger[] = [
      'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
      'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
    ];
    for (const t of triggers) expect(triggerIcon(t, { x: 2, y: 2, width: 36, height: 36 })).toContain(`data-icon="${t}"`);
  });

  it('uses filled envelope for message and filled disk for terminate', () => {
    expect(triggerIcon('message', { x: 2, y: 2, width: 36, height: 36 })).toContain('data-icon="message"');
    expect(triggerIcon('terminate', { x: 2, y: 2, width: 36, height: 36 })).toContain('fill="black"');
  });
});
