import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';
import type { EventNode, GatewayNode, ActivityNode, DataObjectNode } from '@bpm/ast';

describe('parse — flat node kinds', () => {
  it('parses pagination directives and preserves absent defaults', () => {
    expect(parse('task "A" as a').diagram.paginate).toBeUndefined();
    const result = parse('paginate: semantic\npageBreak: lane\n\ntask "A" as a');
    expect(result.errors).toEqual([]);
    expect(result.diagram).toMatchObject({ paginate: 'semantic', pageBreak: 'lane' });
  });

  it('rejects invalid pagination directives and combinations', () => {
    expect(parse('paginate: pages\ntask "A" as a').errors[0]).toMatchObject({ code: 'malformed_paginate' });
    expect(parse('pageBreak: lane\ntask "A" as a').errors[0]).toMatchObject({ code: 'unsupported_pagination_combination' });
  });

  it('rejects recognized but unsupported pagination modes and strategies', () => {
    for (const mode of ['tile', 'hybrid']) {
      expect(parse(`paginate: ${mode}\ntask "A" as a`).errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_pagination_combination', message: expect.stringContaining(`"${mode}"`) }),
      ]));
    }
    for (const strategy of ['group', 'branch']) {
      expect(parse(`paginate: semantic\npageBreak: ${strategy}\ntask "A" as a`).errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_pagination_combination', message: expect.stringContaining(`pageBreak: ${strategy}`) }),
      ]));
    }
  });
  it('rejects duplicate node ids before they can overwrite the first declaration', () => {
    const { diagram, errors } = parse('task "First" as same\ntask "Second" as same');
    expect(errors).toEqual([{
      line: 2,
      column: 1,
      message: 'Identifier "same" is already declared — every node id must be unique',
      code: 'duplicate_id',
    }]);
    expect(diagram.nodes.map((node) => node.label)).toEqual(['First']);
  });

  it('parses an event line', () => {
    const { diagram, errors } = parse('event start message "Order placed" as n1');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toEqual({
      kind: 'event', id: 'n1', label: 'Order placed', category: 'start', trigger: 'message', interrupting: true,
    } satisfies EventNode);
  });

  it('parses a boundary event line, attaching it to its activity id', () => {
    const text = [
      'task "Charge card" as t1',
      'boundary timer interrupting "Timeout" as b1 on t1',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const boundary = diagram.nodes.find((n) => n.id === 'b1') as EventNode;
    expect(boundary).toEqual({
      kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer',
      interrupting: true, attachedToId: 't1',
    });
  });

  it('reports a structured error when a boundary event references an unknown activity id', () => {
    const { errors } = parse('boundary timer interrupting "Timeout" as b1 on nope');
    expect(errors).toEqual([
      { line: 1, column: 1, message: 'Boundary event references unknown activity id "nope"' },
    ]);
  });

  it('parses a gateway line with an explicit type', () => {
    const { diagram, errors } = parse('gateway inclusive "Which paths?" as g1');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toEqual({
      kind: 'gateway', id: 'g1', label: 'Which paths?', gatewayType: 'inclusive',
    } satisfies GatewayNode);
  });

  it('parses task, callActivity, dataObject, dataStore, annotation, group lines', () => {
    const text = [
      'task "Review" as t1',
      'callActivity "Shared flow" as ca1',
      'dataObject "Invoice" as d1',
      'dataStore "Customer DB" as ds1',
      'annotation "SLA note" as note1',
      'group "Critical path" as grp1',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes).toEqual([
      { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'activity', id: 'ca1', label: 'Shared flow', activityType: 'callActivity', collapsed: false, children: [], childEdges: [] },
      { kind: 'dataObject', id: 'd1', label: 'Invoice' },
      { kind: 'dataStore', id: 'ds1', label: 'Customer DB' },
      { kind: 'textAnnotation', id: 'note1', label: 'SLA note' },
      { kind: 'group', id: 'grp1', label: 'Critical path' },
    ] as ActivityNode[] & DataObjectNode[]);
  });

  it('parses BPMN task subtype keywords', () => {
    const text = [
      'userTask "Approve" as u1',
      'serviceTask "Charge card" as s1',
      'sendTask "Notify carrier" as snd1',
      'receiveTask "Await PO" as rcv1',
      'manualTask "Pick items" as m1',
      'businessRuleTask "Score risk" as br1',
      'scriptTask "Transform payload" as sc1',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect((diagram.nodes as ActivityNode[]).map((n) => n.activityType)).toEqual([
      'userTask', 'serviceTask', 'sendTask', 'receiveTask', 'manualTask', 'businessRuleTask', 'scriptTask',
    ]);
  });

  it('reports a structured error for an unknown event trigger', () => {
    const { errors } = parse('event start bogus "x" as n1');
    expect(errors).toEqual([
      { line: 1, column: 1, message: 'Unknown event trigger "bogus"' },
    ]);
  });
});

describe('parse — edges with flow types', () => {
  it('parses every edge arrow token to its flow type', () => {
    const text = [
      'event start none "Start" as n1',
      'gateway exclusive "OK?" as g1',
      'task "Handle" as t1',
      'task "Fallback" as t2',
      'dataObject "Doc" as d1',
      'event end none "End" as n2',
      '',
      'n1 -> g1',
      'g1 => t1 : "yes"',
      'g1 ->> t2',
      't1 ~> n2',
      'd1 ..> t1',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges.map((e) => e.flowType)).toEqual([
      'sequence', 'conditionalSequence', 'defaultSequence', 'message', 'association',
    ]);
    expect(diagram.edges[1].label).toBe('yes');
  });
});

describe('parse — nested containers', () => {
  it('parses a subprocess body into the activity node\'s children/childEdges', () => {
    const text = [
      'subprocess "Handle payment" as sp1',
      '  event start none "Sub start" as sn1',
      '  task "Charge card" as sn2',
      '  sn1 -> sn2',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const sp = diagram.nodes[0] as import('@bpm/ast').ActivityNode;
    expect(sp.activityType).toBe('subProcess');
    expect(sp.children.map((n) => n.id)).toEqual(['sn1', 'sn2']);
    expect(sp.childEdges).toEqual([{ id: 'e1', sourceId: 'sn1', targetId: 'sn2', label: undefined, flowType: 'sequence' }]);
    expect(diagram.nodes).toHaveLength(1); // sn1/sn2 are NOT also top-level nodes
  });

  it('parses nested subprocess-within-subprocess at arbitrary depth', () => {
    const text = [
      'subprocess "Outer" as sp1',
      '  subprocess "Inner" as sp2',
      '    task "Deep task" as dt1',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const outer = diagram.nodes[0] as import('@bpm/ast').ActivityNode;
    const inner = outer.children[0] as import('@bpm/ast').ActivityNode;
    expect(inner.id).toBe('sp2');
    expect(inner.children[0].id).toBe('dt1');
  });

  it('still parses pool/lane blocks unchanged from Milestone 1', () => {
    const text = [
      'pool "Order Process"',
      '  lane "Sales"',
      '    event start none "Start" as n1',
      '    task "Review" as n2',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.pools[0].lanes[0].nodeIds).toEqual(['n1', 'n2']);
    expect(diagram.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('keeps cross-lane edges declared at pool indentation', () => {
    const text = [
      'pool "Order Process"',
      '  lane "Sales"',
      '    task "Review" as n1',
      '  lane "Fulfillment"',
      '    task "Ship" as n2',
      '  n1 -> n2',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges).toEqual([
      { id: 'e1', sourceId: 'n1', targetId: 'n2', label: undefined, flowType: 'sequence' },
    ]);
  });
});

describe('parse — layout directive', () => {
  it('leaves layout undefined when no directive is present', () => {
    const { diagram, errors } = parse('task "Review" as n1');
    expect(errors).toEqual([]);
    expect(diagram.layout).toBeUndefined();
  });

  it('parses a leading "layout: swimlane" directive', () => {
    const text = ['layout: swimlane', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('swimlane');
    expect(diagram.nodes).toHaveLength(1);
  });

  it('parses a leading "layout: flat" directive', () => {
    const text = ['layout: flat', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('flat');
  });

  it('tolerates leading blank lines before the directive', () => {
    const text = ['', '  ', 'layout: flat', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('flat');
  });

  it('stores an unrecognized engine name without a parse error', () => {
    const text = ['layout: diagonal', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('diagonal');
  });

  it('does not treat "layout:" appearing after the first line as a directive', () => {
    const text = ['task "Review" as n1', 'layout: flat'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors.length).toBeGreaterThan(0); // second line is now an unrecognized line
    expect(diagram.layout).toBeUndefined();
  });
});

describe('parse — direction contract', () => {
  it('accepts direction and laneDirection directives', () => {
    const result = parse('direction: left\nlaneDirection: vertical\n\ntask "Review" as t1');
    expect(result.errors).toEqual([]);
    expect(result.diagram).toMatchObject({ direction: 'left', laneDirection: 'vertical' });
  });

  it('reports structured diagnostics for invalid direction values', () => {
    const result = parse('direction: diagonal\nlaneDirection: diagonal\n\ntask "Review" as t1');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_direction' }),
      expect.objectContaining({ code: 'invalid_lane_direction' }),
    ]));
  });
});

describe('parse — positioning directive', () => {
  it('parses a leading "positioning: manual" directive', () => {
    const { diagram, errors } = parse('positioning: manual\n\ntask "Review" as t1 at (40, 40)');
    expect(errors).toEqual([]);
    expect(diagram.positioning).toBe('manual');
  });

  it('reports a structured error for an unknown positioning value', () => {
    const { errors } = parse('positioning: bogus\n\ntask "Review" as t1');
    expect(errors).toContainEqual({ line: 1, column: 1, message: 'Unknown positioning mode "bogus"' });
  });

  it('reports a structured error when both layout: and positioning: manual are set', () => {
    const text = 'layout: flat\npositioning: manual\n\ntask "Review" as t1 at (40, 40)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 2, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  });

  it('allows layout: and positioning: manual to appear in either order', () => {
    const text = 'positioning: manual\nlayout: flat\n\ntask "Review" as t1 at (40, 40)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 1, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  });
});

describe('parse — node position syntax', () => {
  it('parses "at (x, y)" on a node in a manual-positioning diagram', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)';
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({ id: 't1', position: { x: 40, y: 40 } });
  });

  it('requires a position for every non-boundary node in manual mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 3, column: 1,
      message: 'Node "t1" is missing a required position ("at (x, y)") in a manual-positioning diagram',
    });
  });

  it('rejects a position on a boundary event, in either mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)\nboundary timer interrupting "Timeout" as b1 on t1 at (10, 10)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 4, column: 1,
      message: 'Boundary event "b1" cannot have a position — it is always placed relative to its host "t1"',
    });
  });

  it('does not require a position for a boundary event in manual mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)\nboundary timer interrupting "Timeout" as b1 on t1';
    const { errors } = parse(text);
    expect(errors).toEqual([]);
  });
});

describe('parse — pinned nodes without positioning: manual', () => {
  it('allows at (x, y) on a node with no positioning directive', () => {
    const text = 'task "Review" as t1 at (40, 40)\ntask "Approve" as t2\nt1 -> t2';
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({ id: 't1', position: { x: 40, y: 40 } });
    expect(diagram.nodes[1].position).toBeUndefined();
    expect(diagram.positioning).toBeUndefined();
  });

  it('still rejects at (x, y) on a boundary event with no positioning directive', () => {
    const text = [
      'task "Review" as t1',
      'boundary timer interrupting "Timeout" as b1 on t1 at (10, 10)',
    ].join('\n');
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 2, column: 1,
      message: 'Boundary event "b1" cannot have a position — it is always placed relative to its host "t1"',
    });
  });

  it('positioning: manual still requires a position on every non-boundary node (unchanged)', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 3, column: 1,
      message: 'Node "t1" is missing a required position ("at (x, y)") in a manual-positioning diagram',
    });
  });
});

describe('parse — edge attribute block', () => {
  it('parses style, corner, from, and to on an edge', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [style: dashed, corner: round, from: right, to: top]'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toMatchObject({ style: 'dashed', corner: 'round', from: 'right', to: 'top' });
  });

  it('parses an edge attribute block alongside a label', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1: "Yes" [style: dashed]'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toMatchObject({ label: 'Yes', style: 'dashed' });
  });

  it('reports a structured error for an unknown attribute key', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [weight: 3]'].join('\n');
    const { errors } = parse(text);
    expect(errors).toContainEqual({ line: 3, column: 1, message: 'Unknown edge attribute "weight"' });
  });

  it('reports a structured error for an unknown style value', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [style: wiggly]'].join('\n');
    const { errors } = parse(text);
    expect(errors).toContainEqual({ line: 3, column: 1, message: 'Unknown edge style "wiggly"' });
  });

  it('leaves an edge with no attribute block fully unaffected', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toEqual({ id: 'e1', sourceId: 'a1', targetId: 'b1', flowType: 'sequence' });
  });
});
