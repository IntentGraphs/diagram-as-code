import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { exportToXml } from '@bpm/export-xml';
import { importXml } from '../src/index.js';

/** Strip fields the importer can't be expected to reproduce exactly (positions come from
 * whatever layout/DI produced them, not from the original hand-written source). */
function stripGeometry(node: any): any {
  const { position, sizeHint, ...rest } = node;
  if (rest.children) rest.children = rest.children.map(stripGeometry);
  if (rest.childEdges) rest.childEdges = rest.childEdges.map(stripGeometryEdge);
  return rest;
}
function stripGeometryEdge(edge: any): any {
  const { waypoints, labelPlacement, ...rest } = edge;
  return rest;
}

async function roundTripViaXml(text: string) {
  const { diagram, errors } = parse(text);
  expect(errors).toEqual([]);
  const positioned = await layout(diagram);
  const xml = exportToXml(diagram, positioned);
  const result = await importXml(xml);
  return { original: diagram, positioned, ...result };
}

describe('importXml — round trip through this tool\'s own export', () => {
  it('plain flow with conditional/default gateway branches', async () => {
    const text = [
      'event start none "Start" as e0',
      'task "Review" as t1',
      'gateway exclusive "OK?" as g1',
      'task "Ship" as t2',
      'task "Reject" as t3',
      'event end none "Shipped" as e1',
      'event end none "Rejected" as e2',
      '',
      'e0 -> t1',
      't1 -> g1',
      'g1 => t2: "yes"',
      'g1 ->> t3: "no"',
      't2 -> e1',
      't3 -> e2',
    ].join('\n');
    const { original, diagram, warnings, lossReport } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    expect(lossReport.transformed).toBe(0);
    expect(lossReport.dropped).toBe(0);
    expect(lossReport.preserved).toBeGreaterThan(0);
    expect(diagram.nodes.map(stripGeometry).map((n: any) => ({ ...n, id: undefined }))).toHaveLength(original.nodes.length);
    const byLabel = (nodes: any[]) => Object.fromEntries(nodes.map((n) => [n.label, n]));
    const origByLabel = byLabel(original.nodes.map(stripGeometry));
    const impByLabel = byLabel(diagram.nodes.map(stripGeometry));
    for (const label of Object.keys(origByLabel)) {
      expect(impByLabel[label].kind).toBe(origByLabel[label].kind);
      if (origByLabel[label].kind === 'gateway') expect(impByLabel[label].gatewayType).toBe(origByLabel[label].gatewayType);
      if (origByLabel[label].kind === 'activity') expect(impByLabel[label].activityType).toBe(origByLabel[label].activityType);
      if (origByLabel[label].kind === 'event') {
        expect(impByLabel[label].category).toBe(origByLabel[label].category);
        expect(impByLabel[label].trigger).toBe(origByLabel[label].trigger);
      }
    }
    const flowTypesOrig = original.edges.map((e) => e.flowType).sort();
    const flowTypesImp = diagram.edges.map((e) => e.flowType).sort();
    expect(flowTypesImp).toEqual(flowTypesOrig);
    const importedByTarget = new Map(diagram.edges.map((edge) => [edge.targetId, edge]));
    expect(importedByTarget.get('t2')?.label).toBe('yes');
  });

  it('pools and lanes with a message flow between lanes', async () => {
    const text = [
      'pool "Order Processing"',
      '  lane "Sales"',
      '    task "Review" as t1',
      '  lane "Finance"',
      '    task "Charge" as t2',
      '',
      't1 -> t2',
      't1 ~> t2',
    ].join('\n');
    const { diagram, positioned, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    expect(diagram.pools).toHaveLength(1);
    expect(diagram.pools[0].name).toBe('Order Processing');
    expect(diagram.pools[0].lanes.map((l) => l.name).sort()).toEqual(['Finance', 'Sales']);
    expect(diagram.edges.map((e) => e.flowType).sort()).toEqual(['message', 'sequence']);
    expect(diagram.pools[0].position).toEqual({ x: positioned.pools[0].x, y: positioned.pools[0].y });
    expect(diagram.pools[0].sizeHint).toEqual({ width: positioned.pools[0].width, height: positioned.pools[0].height });
    expect(diagram.pools[0].lanes.map((lane) => lane.position)).toEqual(
      positioned.pools[0].lanes.map((lane) => ({ x: lane.x, y: lane.y })),
    );
    expect(diagram.pools[0].lanes.map((lane) => lane.sizeHint)).toEqual(
      positioned.pools[0].lanes.map((lane) => ({ width: lane.width, height: lane.height })),
    );
    const replayed = await layout(diagram);
    const poolGeometry = (pool: (typeof positioned.pools)[number]) => ({
      x: pool.x,
      y: pool.y,
      width: pool.width,
      height: pool.height,
      lanes: pool.lanes.map((lane) => ({ x: lane.x, y: lane.y, width: lane.width, height: lane.height })),
    });
    expect(replayed.pools.map(poolGeometry)).toEqual(positioned.pools.map(poolGeometry));
    expect(replayed.nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })))
      .toEqual(positioned.nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
    expect(replayed.edges.map(({ id, points }) => ({ id, points })))
      .toEqual(positioned.edges.map(({ id, points }) => ({ id, points })));
  });

  it('boundary event never gets a position, and stays attached to its host', async () => {
    const text = [
      'task "Charge card" as t1',
      'boundary timer nonInterrupting "Slow" as b1 on t1',
      'event end none "Done" as e1',
      '',
      't1 -> e1',
    ].join('\n');
    const { diagram, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    const boundary = diagram.nodes.find((n) => n.kind === 'event' && (n as any).attachedToId) as any;
    expect(boundary).toBeDefined();
    expect(boundary.position).toBeUndefined();
    expect(boundary.trigger).toBe('timer');
    expect(boundary.interrupting).toBe(false);
    const host = diagram.nodes.find((n) => n.label === 'Charge card')!;
    expect(boundary.attachedToId).toBe(host.id);
  });

  it('nested subprocess content round-trips as children/childEdges', async () => {
    const text = [
      'subprocess "Handle payment" as sp1',
      '  event start none "Sub start" as sn1',
      '  task "Charge card" as sn2',
      '  sn1 -> sn2',
      'event end none "Done" as e1',
      '',
      'sp1 -> e1',
    ].join('\n');
    const { diagram, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    const sp = diagram.nodes.find((n) => n.kind === 'activity' && (n as any).activityType === 'subProcess') as any;
    expect(sp).toBeDefined();
    expect(sp.children.map((c: any) => c.label).sort()).toEqual(['Charge card', 'Sub start']);
    expect(sp.childEdges).toHaveLength(1);
  });

  it('Camunda extensions round-trip on serviceTask/userTask', async () => {
    const text = [
      'serviceTask "Charge" as s1 [camundaClass: "com.example.ChargeDelegate"]',
      'userTask "Approve" as u1 [camundaFormKey: "embedded:app:forms/approve.html"]',
      'event end none "Done" as e1',
      '',
      's1 -> u1',
      'u1 -> e1',
    ].join('\n');
    const { diagram, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    const s1 = diagram.nodes.find((n) => n.label === 'Charge') as any;
    const u1 = diagram.nodes.find((n) => n.label === 'Approve') as any;
    expect(s1.camunda.class).toBe('com.example.ChargeDelegate');
    expect(u1.camunda.formKey).toBe('embedded:app:forms/approve.html');
  });

  it('preserves timer and message event-definition payloads', async () => {
    const text = [
      'event start timer "Wait" as wait [timerDuration: "PT5M"]',
      'event intermediate message "Received" as received [messageRef: "OrderMessage"]',
    ].join('\n');
    const { diagram, text: importedText, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    expect((diagram.nodes.find((node) => node.id === 'wait') as any).eventDefinition).toEqual({ timerDuration: 'PT5M' });
    expect((diagram.nodes.find((node) => node.id === 'received') as any).eventDefinition).toEqual({ messageRef: 'OrderMessage' });
    expect(importedText).toContain('timerDuration: "PT5M"');
    expect(importedText).toContain('messageRef: "OrderMessage"');
  });

  it('data objects, data stores, annotations, and association flows', async () => {
    const text = [
      'task "A" as a',
      'dataObject "Order" as d1',
      'dataStore "DB" as d2',
      'annotation "Note" as n1',
      '',
      'a ..> d1',
      'a ..> d2',
      'a ..> n1',
    ].join('\n');
    const { diagram, warnings } = await roundTripViaXml(text);
    expect(warnings).toEqual([]);
    expect(diagram.nodes.some((n) => n.kind === 'dataObject' && n.label === 'Order')).toBe(true);
    expect(diagram.nodes.some((n) => n.kind === 'dataStore' && n.label === 'DB')).toBe(true);
    expect(diagram.nodes.some((n) => n.kind === 'textAnnotation' && n.label === 'Note')).toBe(true);
    expect(diagram.edges.every((e) => e.flowType === 'association')).toBe(true);
  });

  it('always sets positioning: manual on the imported diagram', async () => {
    const text = 'task "A" as a\nevent end none "B" as b\na -> b';
    const { diagram } = await roundTripViaXml(text);
    expect(diagram.positioning).toBe('manual');
    expect(diagram.nodes.every((n) => n.position !== undefined)).toBe(true);
  });

  it('the returned text is itself valid .bpm source', async () => {
    const text = 'task "A" as a\nevent end none "B" as b\na -> b';
    const { text: printed } = await roundTripViaXml(text);
    const { errors } = parse(printed);
    expect(errors).toEqual([]);
  });

  it('reports BPMN semantics that are converted but not representable in .bpm text', async () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="p1">
        <intermediateThrowEvent id="throw1" name="Notify"><timerEventDefinition><timeDuration>PT5M</timeDuration></timerEventDefinition></intermediateThrowEvent>
        <task id="task1" name="Repeat"><multiInstanceLoopCharacteristics isSequential="false"/></task>
        <callActivity id="call1" name="Shared flow" calledElement="sharedProcess"/>
      </process>
    </definitions>`;
    const { lossReport } = await importXml(xml);
    expect(lossReport.transformed).toBeGreaterThanOrEqual(3);
    expect(lossReport.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'bpmn:IntermediateThrowEvent', kind: 'transformed' }),
      expect.objectContaining({ sourceType: 'bpmn:loopCharacteristics', kind: 'transformed' }),
      expect.objectContaining({ sourceType: 'bpmn:CallActivity', kind: 'transformed' }),
    ]));
  });
});

describe('importXml — malformed input handling', () => {
  it('surfaces bpmn-moddle\'s own rejection of an illegal element id as a readable warning, and drops just that element instead of crashing', async () => {
    // moddle-xml's own ID grammar (/^([a-z][\w-.]*:)?[a-z_][\w-.]*$/i) is effectively the same as
    // this DSL's identifier grammar, so any id that survives its parse is already valid for us —
    // an id starting with a digit like this never reaches our own mapping code at all; moddle
    // itself drops the element and reports why, which we must surface, not silently swallow.
    const xml = `<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:dc="http://x" xmlns:di="http://x" xmlns:bpmndi="http://x" id="d" targetNamespace="t"><bpmn2:process id="p1" isExecutable="false"><bpmn2:startEvent id="1start" name="Go"/><bpmn2:task id="t1" name="Do it"/><bpmn2:sequenceFlow id="f1" sourceRef="1start" targetRef="t1"/></bpmn2:process></bpmn2:definitions>`;
    const { diagram, warnings } = await importXml(xml);
    expect(warnings.some((w) => w.includes('illegal ID') && w.includes('1start'))).toBe(true);
    expect(diagram.nodes.map((n) => n.label)).toEqual(['Do it']);
  });

  it('re-bases an edge\'s via waypoints into its lane-nested source\'s own frame, matching its node position', async () => {
    // Regression for a real bug found via apps/web/test/e2e/diagram-import-roundtrip.spec.ts
    // The waypointMapper convention expects "via" in the same
    // frame as the source node's own "at (x, y)" — lane-relative when the source is in a lane.
    // DI bounds/waypoints are always canvas-absolute, so both need the same lane-origin
    // subtraction, or the router (once it started respecting "via" at all) mis-routes edges from
    // lane members.
    const xml = `<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="d" targetNamespace="t">
      <bpmn2:collaboration id="c1"><bpmn2:participant id="p1" name="Pool" processRef="pr1"/></bpmn2:collaboration>
      <bpmn2:process id="pr1" isExecutable="false">
        <bpmn2:laneSet id="ls1"><bpmn2:lane id="lane1" name="Lane"><bpmn2:flowNodeRef>t1</bpmn2:flowNodeRef></bpmn2:lane></bpmn2:laneSet>
        <bpmn2:task id="t1" name="A"/>
        <bpmn2:task id="t2" name="B"/>
        <bpmn2:sequenceFlow id="f1" sourceRef="t1" targetRef="t2"/>
      </bpmn2:process>
      <bpmndi:BPMNDiagram id="di1"><bpmndi:BPMNPlane id="pl1" bpmnElement="c1">
        <bpmndi:BPMNShape bpmnElement="lane1"><dc:Bounds x="1000" y="500" width="800" height="400"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="t1"><dc:Bounds x="1040" y="540" width="100" height="60"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="t2"><dc:Bounds x="1500" y="900" width="100" height="60"/></bpmndi:BPMNShape>
        <bpmndi:BPMNEdge bpmnElement="f1"><di:waypoint x="1140" y="570"/><di:waypoint x="1200" y="570"/><di:waypoint x="1200" y="930"/><di:waypoint x="1500" y="930"/></bpmndi:BPMNEdge>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
    </bpmn2:definitions>`;
    const { diagram } = await importXml(xml);
    const t1 = diagram.nodes.find((n) => n.label === 'A')!;
    const edge = diagram.edges[0];
    // t1's own position is already lane-relative: (1040-1000, 540-500) = (40, 40).
    expect(t1.position).toEqual({ x: 40, y: 40 });
    // The interior via points (bend 1 and bend 2, excluding the source/target stubs) must be
    // shifted by the SAME (-1000, -500) lane-origin delta as t1's own position was.
    expect(edge.waypoints).toEqual([{ x: 200, y: 70 }, { x: 200, y: 430 }]);
  });

  it('re-bases collaboration message-flow waypoints into the source lane frame', async () => {
    // Message flows live on the collaboration rather than inside either process, so they are
    // mapped after process/lane edges. Their DI points are still canvas-absolute; leaving them
    // absolute makes layoutManual apply the source lane origin a second time when it maps `via`.
    const xml = `<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="d" targetNamespace="t">
      <bpmn2:collaboration id="c1">
        <bpmn2:participant id="pa" name="A" processRef="pra"/>
        <bpmn2:participant id="pb" name="B" processRef="prb"/>
        <bpmn2:messageFlow id="mf1" sourceRef="ta" targetRef="tb"/>
      </bpmn2:collaboration>
      <bpmn2:process id="pra" isExecutable="false">
        <bpmn2:laneSet id="lsa"><bpmn2:lane id="lanea" name="A lane"><bpmn2:flowNodeRef>ta</bpmn2:flowNodeRef></bpmn2:lane></bpmn2:laneSet>
        <bpmn2:task id="ta" name="Send"/>
      </bpmn2:process>
      <bpmn2:process id="prb" isExecutable="false">
        <bpmn2:laneSet id="lsb"><bpmn2:lane id="laneb" name="B lane"><bpmn2:flowNodeRef>tb</bpmn2:flowNodeRef></bpmn2:lane></bpmn2:laneSet>
        <bpmn2:task id="tb" name="Receive"/>
      </bpmn2:process>
      <bpmndi:BPMNDiagram id="di1"><bpmndi:BPMNPlane id="pl1" bpmnElement="c1">
        <bpmndi:BPMNShape bpmnElement="lanea"><dc:Bounds x="100" y="100" width="500" height="160"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="ta"><dc:Bounds x="140" y="140" width="100" height="60"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="laneb"><dc:Bounds x="100" y="320" width="500" height="160"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="tb"><dc:Bounds x="400" y="360" width="100" height="60"/></bpmndi:BPMNShape>
        <bpmndi:BPMNEdge bpmnElement="mf1"><di:waypoint x="240" y="170"/><di:waypoint x="300" y="170"/><di:waypoint x="300" y="390"/><di:waypoint x="400" y="390"/></bpmndi:BPMNEdge>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
    </bpmn2:definitions>`;
    const { diagram, warnings } = await importXml(xml);
    expect(warnings).toEqual([]);
    const edge = diagram.edges.find((candidate) => candidate.flowType === 'message')!;
    expect(edge.waypoints).toEqual([{ x: 200, y: 70 }, { x: 200, y: 290 }]);
    expect(edge.from).toBe('right');
    expect(edge.to).toBe('left');
  });

  it('allocates non-colliding synthesized lane ids across two pools that each lack lane definitions', async () => {
    const xml = `<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:dc="http://x" xmlns:di="http://x" xmlns:bpmndi="http://x" id="d" targetNamespace="t">
      <bpmn2:collaboration id="c1">
        <bpmn2:participant id="pa" name="A" processRef="pra"/>
        <bpmn2:participant id="pb" name="B" processRef="prb"/>
      </bpmn2:collaboration>
      <bpmn2:process id="pra" isExecutable="false"><bpmn2:task id="ta" name="Task A"/></bpmn2:process>
      <bpmn2:process id="prb" isExecutable="false"><bpmn2:task id="tb" name="Task B"/></bpmn2:process>
    </bpmn2:definitions>`;
    const { diagram, warnings } = await importXml(xml);
    expect(diagram.pools).toHaveLength(2);
    expect(diagram.pools[0].lanes).toHaveLength(1);
    expect(diagram.pools[1].lanes).toHaveLength(1);
    expect(diagram.pools[0].lanes[0].id).not.toBe(diagram.pools[1].lanes[0].id);
    expect(warnings.filter((w) => w.includes('synthesizing a single default lane'))).toHaveLength(2);
  });
});
