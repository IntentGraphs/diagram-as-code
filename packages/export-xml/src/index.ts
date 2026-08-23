import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { flowElementXml, sequenceFlowXml, associationXml } from './elements.js';
import { collaborationXml } from './collaboration.js';
import { shapeXml, edgeXml, poolShapeXml } from './diagramInterchange.js';
import { escapeXml } from './xml.js';

const BASE_NAMESPACES = [
  'xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
];

const CAMUNDA_NS = 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"';
const TARGET_NS = 'targetNamespace="http://bpm.local/schema"';

function hasCamundaExtensions(nodes: DiagramNode[]): boolean {
  return nodes.some((node) => {
    if (node.kind !== 'activity') return false;
    const ext = node.camunda;
    if (ext && (ext.class || ext.expression || ext.formKey)) return true;
    return hasCamundaExtensions(node.children);
  });
}

function eventReferenceElements(nodes: DiagramNode[]): string {
  const refs = {
    message: new Set<string>(),
    error: new Set<string>(),
    escalation: new Set<string>(),
    signal: new Set<string>(),
  };
  const visit = (items: DiagramNode[]) => {
    for (const node of items) {
      if (node.kind === 'event') {
        if (node.eventDefinition?.messageRef) refs.message.add(node.eventDefinition.messageRef);
        if (node.eventDefinition?.errorRef) refs.error.add(node.eventDefinition.errorRef);
        if (node.eventDefinition?.escalationRef) refs.escalation.add(node.eventDefinition.escalationRef);
        if (node.eventDefinition?.signalRef) refs.signal.add(node.eventDefinition.signalRef);
      }
      if (node.kind === 'activity') visit(node.children);
    }
  };
  visit(nodes);
  return [
    ...[...refs.message].map((id) => `<bpmn2:message id="${escapeXml(id)}"/>`),
    ...[...refs.error].map((id) => `<bpmn2:error id="${escapeXml(id)}"/>`),
    ...[...refs.escalation].map((id) => `<bpmn2:escalation id="${escapeXml(id)}"/>`),
    ...[...refs.signal].map((id) => `<bpmn2:signal id="${escapeXml(id)}"/>`),
  ].join('');
}

function definitionNamespaces(includeCamunda: boolean): string {
  return [...BASE_NAMESPACES, ...(includeCamunda ? [CAMUNDA_NS] : []), TARGET_NS].join(' ');
}

function renderFlowElements(nodes: DiagramNode[], edges: DiagramEdge[], edgeId: (id: string) => string): string {
  const nodeById = new Map(collectNodes(nodes).map((node) => [node.id, node]));
  const isDataAssociation = (edge: DiagramEdge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    return edge.flowType === 'association'
      && ((source?.kind === 'activity' && (target?.kind === 'dataObject' || target?.kind === 'dataStore'))
        || (target?.kind === 'activity' && (source?.kind === 'dataObject' || source?.kind === 'dataStore')));
  };
  const defaultFlowIdBySourceId = new Map(
    edges.filter((e) => e.flowType === 'defaultSequence').map((e) => [e.sourceId, edgeId(e.id)]),
  );
  const elements = nodes.map((node) => flowElementXml(
    node,
    (childNodes, childEdges) => renderFlowElements(childNodes, childEdges, edgeId),
    defaultFlowIdBySourceId,
    edges.filter((edge) => isDataAssociation(edge) && (edge.sourceId === node.id || edge.targetId === node.id)),
    edgeId,
  )).join('');
  const sequenceFlows = edges
    .filter((e) => e.flowType === 'sequence' || e.flowType === 'conditionalSequence' || e.flowType === 'defaultSequence')
    .map((edge) => sequenceFlowXml(edge, edgeId(edge.id))).join('');
  const associations = edges
    .filter((e) => e.flowType === 'association' && !isDataAssociation(e))
    .map((edge) => associationXml(edge, edgeId(edge.id))).join('');
  return elements + sequenceFlows + associations;
}

function collectNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.flatMap((node) => node.kind === 'activity'
    ? [node, ...collectNodes(node.children)]
    : [node]);
}

function collectEdges(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  return [
    ...edges,
    ...nodes.flatMap((node) => node.kind === 'activity'
      ? collectEdges(node.children, node.childEdges)
      : []),
  ];
}

function createEdgeIdResolver(diagram: Diagram): (id: string) => string {
  const nodes = collectNodes(diagram.nodes);
  const used = new Set([
    'definitions', 'diagram1', 'plane1', 'process1', 'collaboration1', 'participant_process1',
    ...nodes.flatMap((node) => [node.id, `shape_${node.id}`]),
    ...diagram.pools.flatMap((pool) => [
      pool.id, `participant_${pool.id}`, `process_${pool.id}`, `laneSet_${pool.id}`, `shape_${pool.id}`,
      ...pool.lanes.flatMap((lane) => [lane.id, `shape_${lane.id}`]),
    ]),
  ]);
  const resolved = new Map<string, string>();

  for (const edge of collectEdges(diagram.nodes, diagram.edges)) {
    let candidate = edge.id;
    let suffix = 2;
    while (used.has(candidate) || used.has(`shape_${candidate}`)) {
      candidate = `flow_${edge.id}${suffix === 2 ? '' : `_${suffix}`}`;
      suffix += 1;
    }
    resolved.set(edge.id, candidate);
    used.add(candidate);
    used.add(`shape_${candidate}`);
  }

  return (id) => resolved.get(id) ?? id;
}

export function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string {
  const edgeId = createEdgeIdResolver(diagram);
  const renderProcess = (nodes: DiagramNode[], edges: DiagramEdge[]) => renderFlowElements(nodes, edges, edgeId);
  const messageEdges = diagram.edges.filter((edge) => edge.flowType === 'message');
  const hasCollaboration = diagram.pools.length > 0 || messageEdges.length > 0;
  const includeCamunda = hasCamundaExtensions(collectNodes(diagram.nodes));
  const globalEventReferences = eventReferenceElements(collectNodes(diagram.nodes));
  const body = diagram.pools.length > 0
    ? (() => {
        const { collaboration, processes } = collaborationXml(diagram, renderProcess, edgeId);
        return collaboration + processes;
      })()
    : (() => {
        const process = `<bpmn2:process id="process1" isExecutable="false">${renderProcess(diagram.nodes, diagram.edges)}</bpmn2:process>`;
        if (messageEdges.length === 0) return process;
        const messageFlows = messageEdges
          .map((edge) => `<bpmn2:messageFlow id="${escapeXml(edgeId(edge.id))}" sourceRef="${escapeXml(edge.sourceId)}" targetRef="${escapeXml(edge.targetId)}"/>`)
          .join('');
        return `<bpmn2:collaboration id="collaboration1"><bpmn2:participant id="participant_process1" processRef="process1"/>${messageFlows}</bpmn2:collaboration>${process}`;
      })();

  const planeElement = hasCollaboration ? 'collaboration1' : 'process1';

  const shapes = positioned.nodes.map((node) => shapeXml(node, edgeId)).join('');
  const edges = positioned.edges.map((edge) => edgeXml(edge, edgeId(edge.id))).join('');
  const poolShapes = positioned.pools.map(poolShapeXml).join('');
  const planeContent = shapes + edges + poolShapes;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<bpmn2:definitions id="definitions" ${definitionNamespaces(includeCamunda)}>` +
    globalEventReferences + body +
    `<bpmndi:BPMNDiagram id="diagram1"><bpmndi:BPMNPlane id="plane1" bpmnElement="${planeElement}">${planeContent}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>` +
    `</bpmn2:definitions>`
  );
}
