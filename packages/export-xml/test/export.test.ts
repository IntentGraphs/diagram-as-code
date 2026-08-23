import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { layout } from '@bpm/layout';
import { parse } from '@bpm/parser';
import { exportToXml } from '../src/index.js';
import { importWithBpmnJs, roundTripCamundaXml } from './roundTrip.js';
import { VERIFICATION_DIAGRAMS } from './verificationDiagrams.js';
import type { Diagram, EventTrigger, GatewayType } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';

const fixture = (name: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

describe('exportToXml — minimal diagram', () => {
  it('exports a valid BPMN 2.0 document bpmn-js can import', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'n2', label: 'End', category: 'end', trigger: 'none', interrupting: true },
      ],
      edges: [
        { id: 'e1', sourceId: 'n1', targetId: 't1', flowType: 'sequence' },
        { id: 'e2', sourceId: 't1', targetId: 'n2', flowType: 'sequence' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        { ...diagram.nodes[0], x: 0, y: 0, width: 40, height: 40 },
        { ...diagram.nodes[1], x: 100, y: 0, width: 100, height: 60 },
        { ...diagram.nodes[2], x: 260, y: 0, width: 40, height: 40 },
      ] as PositionedDiagram['nodes'],
      edges: [
        { ...diagram.edges[0], points: [{ x: 40, y: 20 }, { x: 100, y: 30 }] },
        { ...diagram.edges[1], points: [{ x: 200, y: 30 }, { x: 260, y: 20 }] },
      ],
    };

    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('bpmn2:definitions');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('escapes hostile labels and emits XML that bpmn-js can import', async () => {
    const { diagram } = parse('task "safe" as t1');
    diagram.nodes[0].label = '<script>& " \' \n\u0001';
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
    expect(xml).toContain('\uFFFD');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});

describe('exportToXml — BPMN task subtypes', () => {
  it('exports distinct BPMN 2.0 task tags for each subtype', async () => {
    const subtypes = [
      'userTask', 'serviceTask', 'sendTask', 'receiveTask',
      'manualTask', 'businessRuleTask', 'scriptTask',
    ] as const;
    const diagram: Diagram = {
      pools: [],
      nodes: subtypes.map((activityType, i) => ({
        kind: 'activity' as const,
        id: `n${i}`,
        label: activityType,
        activityType,
        collapsed: false,
        children: [],
        childEdges: [],
      })),
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 120, y: 0, width: 100, height: 60 })) as PositionedDiagram['nodes'],
      edges: [],
    };
    const xml = exportToXml(diagram, positioned);
    for (const subtype of subtypes) {
      expect(xml).toContain(`<bpmn2:${subtype}`);
    }
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});

describe('exportToXml — Camunda vendor extensions', () => {
  it('omits the camunda namespace when no vendor attributes are present', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [{ ...diagram.nodes[0], x: 0, y: 0, width: 100, height: 60 }] as PositionedDiagram['nodes'],
      edges: [],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).not.toContain('xmlns:camunda');
    expect(xml).not.toContain('camunda:');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports camunda:class on a service task and round-trips the value through bpmn-js', async () => {
    const { diagram, errors } = parse(fixture('camunda-class.bpm'));
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('xmlns:camunda="http://camunda.org/schema/1.0/bpmn"');
    expect(xml).toContain('camunda:class="com.example.ChargeDelegate"');
    const saved = await roundTripCamundaXml(xml);
    expect(saved).toContain('camunda:class="com.example.ChargeDelegate"');
  });

  it('exports camunda:expression on a service task and round-trips the value through bpmn-js', async () => {
    const { diagram, errors } = parse(fixture('camunda-expression.bpm'));
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('camunda:expression="${amount * 1.1}"');
    const saved = await roundTripCamundaXml(xml);
    expect(saved).toContain('camunda:expression="${amount * 1.1}"');
  });

  it('exports camunda:formKey on a user task and round-trips the value through bpmn-js', async () => {
    const { diagram, errors } = parse(fixture('camunda-formKey.bpm'));
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('camunda:formKey="embedded:app:forms/approve.html"');
    const saved = await roundTripCamundaXml(xml);
    expect(saved).toContain('camunda:formKey="embedded:app:forms/approve.html"');
  });
});

describe('exportToXml — event triggers and gateways', () => {
  const ALL_TRIGGERS: EventTrigger[] = [
    'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
    'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
  ];
  const ALL_GATEWAYS: GatewayType[] = ['exclusive', 'parallel', 'inclusive', 'complex', 'eventBased'];

  it.each(ALL_TRIGGERS)('exports a valid document for a start event with trigger "%s"', async (trigger) => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{ kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger, interrupting: true }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{ ...diagram.nodes[0], x: 0, y: 0, width: 40, height: 40 }] as PositionedDiagram['nodes'],
    };
    await expect(importWithBpmnJs(exportToXml(diagram, positioned))).resolves.not.toThrow();
  });

  it.each(ALL_GATEWAYS)('exports a valid document for a "%s" gateway', async (gatewayType) => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{ kind: 'gateway', id: 'g1', label: 'Gate', gatewayType }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{ ...diagram.nodes[0], x: 0, y: 0, width: 50, height: 50 }] as PositionedDiagram['nodes'],
    };
    await expect(importWithBpmnJs(exportToXml(diagram, positioned))).resolves.not.toThrow();
  });
});

describe('exportToXml — boundary events and nested activities', () => {
  it('exports a boundary event with attachedToRef and cancelActivity', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: false, attachedToId: 't1' },
      ],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [
        { ...diagram.nodes[0], x: 0, y: 0, width: 100, height: 60 },
        { ...diagram.nodes[1], x: 80, y: 50, width: 36, height: 36 },
      ] as PositionedDiagram['nodes'],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('attachedToRef="t1"');
    expect(xml).toContain('cancelActivity="false"');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports an expanded subprocess with nested flow elements', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{
        kind: 'activity', id: 'sp1', label: 'Payment', activityType: 'subProcess', collapsed: false,
        children: [
          { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true },
          { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        ],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
      }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{
        ...diagram.nodes[0], x: 0, y: 0, width: 300, height: 200,
        children: [
          { ...(diagram.nodes[0] as any).children[0], x: 20, y: 20, width: 40, height: 40 },
          { ...(diagram.nodes[0] as any).children[1], x: 100, y: 20, width: 100, height: 60 },
        ],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence', points: [{ x: 60, y: 40 }, { x: 100, y: 50 }] }],
      }] as PositionedDiagram['nodes'],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('id="sn1"');
    expect(xml).toContain('id="sn2"');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});

describe('exportToXml — data, artifacts, conditional/default flows', () => {
  it('exports dataObject, dataStore, textAnnotation, group, and an association', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'dataObject', id: 'd1', label: 'Invoice' },
        { kind: 'dataStore', id: 'ds1', label: 'DB' },
        { kind: 'textAnnotation', id: 'note1', label: 'SLA' },
        { kind: 'group', id: 'grp1', label: 'Critical' },
      ],
      edges: [{ id: 'a1', sourceId: 'd1', targetId: 't1', flowType: 'association' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 60, y: 0, width: 50, height: 50 })) as PositionedDiagram['nodes'],
      edges: [{ ...diagram.edges[0], points: [{ x: 50, y: 25 }, { x: 60, y: 25 }] }],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<bpmn2:dataInputAssociation id="a1"><bpmn2:sourceRef>d1</bpmn2:sourceRef>');
    expect(xml).not.toContain('<bpmn2:association id="a1"');
    for (const id of ['t1', 'd1', 'ds1', 'note1', 'grp1', 'a1']) expect(xml).toContain(`id="${id}"`);
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports a default flow attribute on the source gateway and a condition expression on the conditional flow', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'gateway', id: 'g1', label: 'OK?', gatewayType: 'exclusive' },
        { kind: 'activity', id: 't1', label: 'Yes path', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 't2', label: 'Default path', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e1', sourceId: 'g1', targetId: 't1', flowType: 'conditionalSequence', label: 'yes' },
        { id: 'e2', sourceId: 'g1', targetId: 't2', flowType: 'defaultSequence' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 120, y: 0, width: 60, height: 60 })) as PositionedDiagram['nodes'],
      edges: diagram.edges.map((e) => ({ ...e, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })),
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('default="e2"');
    expect(xml).toContain('<bpmn2:conditionExpression');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports an empty conditional expression when the label is explicitly empty', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'gateway', id: 'g1', label: 'OK?', gatewayType: 'exclusive' },
        { kind: 'activity', id: 't1', label: 'Path', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'g1', targetId: 't1', flowType: 'conditionalSequence', label: '' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((node, index) => ({ ...node, x: index * 120, y: 0, width: 60, height: 60 })) as PositionedDiagram['nodes'],
      edges: [{ ...diagram.edges[0], points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<bpmn2:conditionExpression xsi:type="bpmn2:tFormalExpression"></bpmn2:conditionExpression>');
  });
});

describe('exportToXml — pools, lanes, message flows', () => {
  it('exports a collaboration with participants, lanes, and a message flow', async () => {
    const diagram: Diagram = {
      pools: [
        { id: 'pool1', name: 'Order Process', lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }] },
        { id: 'pool2', name: 'Carrier', lanes: [{ id: 'lane2', name: 'Logistics', nodeIds: ['n3'] }] },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n3', label: 'Ship', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' },
        { id: 'e2', sourceId: 'n2', targetId: 'n3', flowType: 'message' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [
        { id: 'pool1', name: 'Order Process', x: 0, y: 0, width: 400, height: 150, lanes: [{ id: 'lane1', name: 'Sales', x: 0, y: 0, width: 400, height: 150 }] },
        { id: 'pool2', name: 'Carrier', x: 0, y: 160, width: 200, height: 100, lanes: [{ id: 'lane2', name: 'Logistics', x: 0, y: 160, width: 200, height: 100 }] },
      ],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 120, y: i > 1 ? 170 : 20, width: 60, height: 60 })) as PositionedDiagram['nodes'],
      edges: diagram.edges.map((e) => ({ ...e, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })),
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<bpmn2:collaboration');
    expect(xml).toContain('<bpmn2:participant');
    expect(xml).toContain('<bpmn2:laneSet');
    expect(xml).toContain('<bpmn2:flowNodeRef>n1</bpmn2:flowNodeRef>');
    expect(xml).toContain('<bpmn2:messageFlow');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('escapes special characters in pool and lane names', async () => {
    const diagram: Diagram = {
      pools: [
        { id: 'pool1', name: 'A & B "Corp"', lanes: [{ id: 'lane1', name: 'Sales <Team>', nodeIds: ['n1'] }] },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
      ],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [
        { id: 'pool1', name: 'A & B "Corp"', x: 0, y: 0, width: 400, height: 150, lanes: [{ id: 'lane1', name: 'Sales <Team>', x: 0, y: 0, width: 400, height: 150 }] },
      ],
      nodes: [{ ...diagram.nodes[0], x: 20, y: 20, width: 40, height: 40 }] as PositionedDiagram['nodes'],
      edges: [],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('name="A &amp; B &quot;Corp&quot;"');
    expect(xml).toContain('name="Sales &lt;Team&gt;"');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});

describe('exportToXml — diagram interchange geometry', () => {
  it('includes a BPMNShape with the right bounds for every node and a BPMNEdge with waypoints for every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 't1', flowType: 'sequence' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        { ...diagram.nodes[0], x: 10, y: 20, width: 40, height: 40 },
        { ...diagram.nodes[1], x: 100, y: 15, width: 100, height: 60 },
      ] as PositionedDiagram['nodes'],
      edges: [{ ...diagram.edges[0], points: [{ x: 50, y: 40 }, { x: 100, y: 45 }] }],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('bpmnElement="n1"');
    expect(xml).toContain('x="10" y="20" width="40" height="40"');
    expect(xml).toContain('bpmnElement="e1"');
    expect(xml).toContain('<di:waypoint x="50" y="40"/>');
    expect(xml).toContain('<di:waypoint x="100" y="45"/>');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});

describe('exportToXml — full pipeline round trip', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('exports a valid document for the "%s" diagram', async (_name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
