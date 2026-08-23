import type { DiagramNode, DiagramEdge, GatewayType } from '@bpm/ast';
import { escapeXml } from './xml.js';
import { eventDefinitionXml, isParallelMultiple } from './eventDefinitions.js';

export function eventElementXml(node: DiagramNode & { kind: 'event' }): string {
  const definition = eventDefinitionXml(node.trigger, node.eventDefinition);
  const parallelAttr = isParallelMultiple(node.trigger) ? ' parallelMultiple="true"' : '';
  const id = escapeXml(node.id);

  if (node.attachedToId) {
    const attrs = `id="${id}" name="${escapeXml(node.label)}" attachedToRef="${escapeXml(node.attachedToId)}" cancelActivity="${node.interrupting}"${parallelAttr}`;
    return definition
      ? `<bpmn2:boundaryEvent ${attrs}>${definition}</bpmn2:boundaryEvent>`
      : `<bpmn2:boundaryEvent ${attrs}/>`;
  }

  const tag = node.category === 'start' ? 'startEvent' : node.category === 'end' ? 'endEvent' : 'intermediateCatchEvent';
  const attrs = `id="${id}" name="${escapeXml(node.label)}"${parallelAttr}`;
  return definition ? `<bpmn2:${tag} ${attrs}>${definition}</bpmn2:${tag}>` : `<bpmn2:${tag} ${attrs}/>`;
}

const GATEWAY_TAG: Record<GatewayType, string> = {
  exclusive: 'exclusiveGateway',
  parallel: 'parallelGateway',
  inclusive: 'inclusiveGateway',
  complex: 'complexGateway',
  eventBased: 'eventBasedGateway',
};

export function gatewayElementXml(node: DiagramNode & { kind: 'gateway' }): string {
  return `<bpmn2:${GATEWAY_TAG[node.gatewayType]} id="${escapeXml(node.id)}" name="${escapeXml(node.label)}"/>`;
}

const NESTABLE = new Set(['subProcess', 'transaction']);

const ACTIVITY_TAG: Record<string, string> = {
  task: 'task',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  sendTask: 'sendTask',
  receiveTask: 'receiveTask',
  manualTask: 'manualTask',
  businessRuleTask: 'businessRuleTask',
  scriptTask: 'scriptTask',
  subProcess: 'subProcess',
  transaction: 'transaction',
  callActivity: 'callActivity',
};

export function activityElementXml(
  node: DiagramNode & { kind: 'activity' },
  renderFlowElements: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
): string {
  const tag = ACTIVITY_TAG[node.activityType] ?? 'task';
  const id = escapeXml(node.id);
  const camundaAttrs = camundaAttrXml(node);

  if (NESTABLE.has(node.activityType) && !node.collapsed) {
    const inner = renderFlowElements(node.children, node.childEdges);
    return `<bpmn2:${tag} id="${id}" name="${escapeXml(node.label)}"${camundaAttrs}>${inner}</bpmn2:${tag}>`;
  }
  return `<bpmn2:${tag} id="${id}" name="${escapeXml(node.label)}"${camundaAttrs}/>`;
}

function camundaAttrXml(node: DiagramNode & { kind: 'activity' }): string {
  const ext = node.camunda;
  if (!ext) return '';
  const parts: string[] = [];
  if (ext.class) parts.push(` camunda:class="${escapeXml(ext.class)}"`);
  if (ext.expression) parts.push(` camunda:expression="${escapeXml(ext.expression)}"`);
  if (ext.formKey) parts.push(` camunda:formKey="${escapeXml(ext.formKey)}"`);
  return parts.join('');
}

export function sequenceFlowXml(edge: DiagramEdge, id = edge.id): string {
  const condition = edge.flowType === 'conditionalSequence' && edge.label !== undefined
    ? `<bpmn2:conditionExpression xsi:type="bpmn2:tFormalExpression">${escapeXml(edge.label)}</bpmn2:conditionExpression>`
    : '';
  const attrs = `id="${escapeXml(id)}" sourceRef="${escapeXml(edge.sourceId)}" targetRef="${escapeXml(edge.targetId)}"`;
  return condition ? `<bpmn2:sequenceFlow ${attrs}>${condition}</bpmn2:sequenceFlow>` : `<bpmn2:sequenceFlow ${attrs}/>`;
}

export function dataObjectElementXml(node: DiagramNode & { kind: 'dataObject' }): string {
  const id = escapeXml(node.id);
  return `<bpmn2:dataObject id="${id}_do"/><bpmn2:dataObjectReference id="${id}" name="${escapeXml(node.label)}" dataObjectRef="${id}_do"/>`;
}

export function dataStoreElementXml(node: DiagramNode & { kind: 'dataStore' }): string {
  return `<bpmn2:dataStoreReference id="${escapeXml(node.id)}" name="${escapeXml(node.label)}"/>`;
}

export function textAnnotationElementXml(node: DiagramNode & { kind: 'textAnnotation' }): string {
  return `<bpmn2:textAnnotation id="${escapeXml(node.id)}"><bpmn2:text>${escapeXml(node.label)}</bpmn2:text></bpmn2:textAnnotation>`;
}

export function groupElementXml(node: DiagramNode & { kind: 'group' }): string {
  return `<bpmn2:group id="${escapeXml(node.id)}"/>`;
}

export function associationXml(edge: DiagramEdge, id = edge.id): string {
  return `<bpmn2:association id="${escapeXml(id)}" sourceRef="${escapeXml(edge.sourceId)}" targetRef="${escapeXml(edge.targetId)}"/>`;
}

export function dataAssociationXml(edge: DiagramEdge, activityId: string, dataId: string, id = edge.id): string {
  const edgeId = escapeXml(id);
  const data = escapeXml(dataId);
  if (edge.sourceId === activityId) {
    return `<bpmn2:dataOutputAssociation id="${edgeId}"><bpmn2:targetRef>${data}</bpmn2:targetRef></bpmn2:dataOutputAssociation>`;
  }
  // bpmn-js represents the activity endpoint of an input association with a
  // generated Property. Keeping that placeholder makes the element type and
  // docking behavior survive an Edit-mode round trip.
  const property = `${activityId}_${id}_property`;
  return `<bpmn2:property id="${escapeXml(property)}"/><bpmn2:dataInputAssociation id="${edgeId}"><bpmn2:sourceRef>${data}</bpmn2:sourceRef><bpmn2:targetRef>${escapeXml(property)}</bpmn2:targetRef></bpmn2:dataInputAssociation>`;
}

export function flowElementXml(
  node: DiagramNode,
  renderFlowElements: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
  defaultFlowIdBySourceId: Map<string, string>,
  dataAssociations: DiagramEdge[] = [],
  edgeId: (id: string) => string = (id) => id,
): string {
  const defaultAttr = (id: string) => {
    const flowId = defaultFlowIdBySourceId.get(id);
    return flowId ? ` default="${escapeXml(flowId)}"` : '';
  };

  switch (node.kind) {
    case 'event': return eventElementXml(node);
    case 'gateway': return gatewayElementXml(node).replace('/>', `${defaultAttr(node.id)}/>`);
    case 'activity': {
      const eid = escapeXml(node.id);
      const xml = activityElementXml(node, renderFlowElements);
      const nested = dataAssociations.map((edge) => dataAssociationXml(
        edge, node.id, edge.sourceId === node.id ? edge.targetId : edge.sourceId, edgeId(edge.id),
      )).join('');
      const tag = ACTIVITY_TAG[node.activityType] ?? 'task';
      const withAssociations = nested
        ? (xml.endsWith('/>')
          ? `${xml.slice(0, -2)}>${nested}</bpmn2:${tag}>`
          : xml.replace(`</bpmn2:${tag}>`, `${nested}</bpmn2:${tag}>`))
        : xml;
      return withAssociations.replace(
        new RegExp(`id="${eid}"`),
        `id="${eid}"${defaultAttr(node.id)}`,
      );
    }
    case 'dataObject': return dataObjectElementXml(node);
    case 'dataStore': return dataStoreElementXml(node);
    case 'textAnnotation': return textAnnotationElementXml(node);
    case 'group': return groupElementXml(node);
  }
}
