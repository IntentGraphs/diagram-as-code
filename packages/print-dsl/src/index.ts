import type {
  Diagram, DiagramNode, DiagramEdge, Pool, Lane, FlowType,
} from '@bpm/ast';
export { freezeDiagram } from './freeze.js';

const INDENT = '  ';

const ARROW_BY_FLOW: Record<FlowType, string> = {
  sequence: '->',
  conditionalSequence: '=>',
  defaultSequence: '->>',
  message: '~>',
  association: '..>',
};

/** The DSL's "<label>" delimiter has no escape mechanism — a literal quote can't be represented. */
function quoteLabel(label: string): string {
  return `"${label.replace(/"/g, "'")}"`;
}

function quoteAttrValue(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

function fmtCoord(n: number): string {
  return String(Math.round(n));
}

function fmtFraction(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function nodeSuffix(node: DiagramNode, allowPosition: boolean): string {
  let s = '';
  if (allowPosition && node.position) {
    s += ` at (${fmtCoord(node.position.x)}, ${fmtCoord(node.position.y)})`;
  }
  if (node.sizeHint) {
    s += ` size (${fmtCoord(node.sizeHint.width)}, ${fmtCoord(node.sizeHint.height)})`;
  }
  const attrPairs: string[] = [];
  if (node.visual?.label) attrPairs.push(`label: ${node.visual.label}`);
  if (node.visual?.wrap) attrPairs.push(`wrap: ${node.visual.wrap}`);
  if (node.visual?.font) attrPairs.push(`font: ${node.visual.font}`);
  if (node.visual?.align) attrPairs.push(`align: ${node.visual.align}`);
  if (node.camunda?.class) attrPairs.push(`camundaClass: ${quoteAttrValue(node.camunda.class)}`);
  if (node.camunda?.expression) attrPairs.push(`camundaExpression: ${quoteAttrValue(node.camunda.expression)}`);
  if (node.camunda?.formKey) attrPairs.push(`camundaFormKey: ${quoteAttrValue(node.camunda.formKey)}`);
  if (node.kind === 'event') {
    if (node.eventDefinition?.timerDate) attrPairs.push(`timerDate: ${quoteAttrValue(node.eventDefinition.timerDate)}`);
    if (node.eventDefinition?.timerDuration) attrPairs.push(`timerDuration: ${quoteAttrValue(node.eventDefinition.timerDuration)}`);
    if (node.eventDefinition?.timerCycle) attrPairs.push(`timerCycle: ${quoteAttrValue(node.eventDefinition.timerCycle)}`);
    if (node.eventDefinition?.messageRef) attrPairs.push(`messageRef: ${quoteAttrValue(node.eventDefinition.messageRef)}`);
    if (node.eventDefinition?.errorRef) attrPairs.push(`errorRef: ${quoteAttrValue(node.eventDefinition.errorRef)}`);
    if (node.eventDefinition?.escalationRef) attrPairs.push(`escalationRef: ${quoteAttrValue(node.eventDefinition.escalationRef)}`);
    if (node.eventDefinition?.signalRef) attrPairs.push(`signalRef: ${quoteAttrValue(node.eventDefinition.signalRef)}`);
    if (node.eventDefinition?.condition) attrPairs.push(`condition: ${quoteAttrValue(node.eventDefinition.condition)}`);
  }
  if (attrPairs.length > 0) s += ` [${attrPairs.join(', ')}]`;
  return s;
}

function printNode(node: DiagramNode, indentLevel: number, out: string[]): void {
  const pad = INDENT.repeat(indentLevel);
  const label = quoteLabel(node.label);

  switch (node.kind) {
    case 'event': {
      if (node.attachedToId) {
        const interrupting = node.interrupting ? 'interrupting' : 'nonInterrupting';
        out.push(`${pad}boundary ${node.trigger} ${interrupting} ${label} as ${node.id} on ${node.attachedToId}${nodeSuffix(node, false)}`);
      } else {
        out.push(`${pad}event ${node.category} ${node.trigger} ${label} as ${node.id}${nodeSuffix(node, true)}`);
      }
      return;
    }
    case 'gateway':
      out.push(`${pad}gateway ${node.gatewayType} ${label} as ${node.id}${nodeSuffix(node, true)}`);
      return;
    case 'activity': {
      const keyword = node.activityType === 'subProcess' ? 'subprocess' : node.activityType;
      const collapsedSuffix = node.collapsed ? ' collapsed' : '';
      out.push(`${pad}${keyword} ${label} as ${node.id}${collapsedSuffix}${nodeSuffix(node, true)}`);
      const nestable = node.activityType === 'subProcess' || node.activityType === 'transaction';
      if (nestable && !node.collapsed) {
        for (const child of node.children) printNode(child, indentLevel + 1, out);
        for (const edge of node.childEdges) out.push(`${INDENT.repeat(indentLevel + 1)}${printEdge(edge)}`);
      }
      return;
    }
    case 'dataObject':
      out.push(`${pad}dataObject ${label} as ${node.id}${nodeSuffix(node, true)}`);
      return;
    case 'dataStore':
      out.push(`${pad}dataStore ${label} as ${node.id}${nodeSuffix(node, true)}`);
      return;
    case 'textAnnotation':
      out.push(`${pad}annotation ${label} as ${node.id}${nodeSuffix(node, true)}`);
      return;
    case 'group':
      out.push(`${pad}group ${label} as ${node.id}${nodeSuffix(node, true)}`);
  }
}

function printEdge(edge: DiagramEdge): string {
  const arrow = ARROW_BY_FLOW[edge.flowType];
  let s = `${edge.sourceId} ${arrow} ${edge.targetId}`;
  if (edge.label !== undefined) s += `: ${quoteLabel(edge.label)}`;

  const attrPairs: string[] = [];
  if (edge.style) attrPairs.push(`style: ${edge.style}`);
  if (edge.corner) attrPairs.push(`corner: ${edge.corner}`);
  if (edge.from) attrPairs.push(`from: ${edge.from}`);
  if (edge.to) attrPairs.push(`to: ${edge.to}`);
  if (edge.waypoints && edge.waypoints.length > 0) {
    attrPairs.push(`via: ${edge.waypoints.map((p) => `(${fmtCoord(p.x)}, ${fmtCoord(p.y)})`).join(' ')}`);
  }
  if (edge.labelPlacement?.at !== undefined) attrPairs.push(`labelAt: ${fmtFraction(edge.labelPlacement.at)}`);
  if (edge.labelPlacement?.side) attrPairs.push(`labelSide: ${edge.labelPlacement.side}`);
  if (edge.labelPlacement?.offset) {
    attrPairs.push(`labelOffset: (${fmtCoord(edge.labelPlacement.offset.x)}, ${fmtCoord(edge.labelPlacement.offset.y)})`);
  }
  if (attrPairs.length > 0) s += ` [${attrPairs.join(', ')}]`;
  return s;
}

/**
 * The inverse of @bpm/parser: given a parsed Diagram, print valid .bpm DSL source text.
 * Deterministic/mechanical — no attempt to preserve original formatting or ordering (there is
 * none to preserve for a diagram whose origin isn't hand-written text, e.g. one produced by
 * importing BPMN XML). See docs/superpowers/specs/2026-08-17-diagram-mode-text-import-design.md
 * option set 1 for why this approach was chosen over a format-preserving printer.
 */
export function printDiagram(diagram: Diagram): string {
  const header: string[] = [];
  if (diagram.positioning === 'manual') header.push('positioning: manual');
  if (diagram.layout) header.push(`layout: ${diagram.layout}`);
  if (diagram.layoutSpacing && diagram.layoutSpacing !== 'normal') header.push(`layoutSpacing: ${diagram.layoutSpacing}`);
  if (diagram.page) {
    header.push(`page: ${diagram.page.width}${diagram.page.unit} x ${diagram.page.height}${diagram.page.unit}`);
    if (diagram.page.fit !== 'contain') header.push(`fit: ${diagram.page.fit}`);
  }
  if (diagram.renderMode) header.push(`render: ${diagram.renderMode}`);

  const laneOf = new Map<string, { pool: Pool; lane: Lane }>();
  for (const pool of diagram.pools) {
    for (const lane of pool.lanes) {
      for (const id of lane.nodeIds) laneOf.set(id, { pool, lane });
    }
  }
  const nodesById = new Map(diagram.nodes.map((n) => [n.id, n]));

  const declLines: string[] = [];
  for (const pool of diagram.pools) {
    declLines.push(`pool ${quoteLabel(pool.name)}`);
    for (const lane of pool.lanes) {
      declLines.push(`${INDENT}lane ${quoteLabel(lane.name)}`);
      for (const id of lane.nodeIds) {
        const node = nodesById.get(id);
        if (node) printNode(node, 2, declLines);
      }
    }
  }
  for (const node of diagram.nodes) {
    if (!laneOf.has(node.id)) printNode(node, 0, declLines);
  }

  const edgeLines = diagram.edges.map(printEdge);

  const sections = [header, declLines, edgeLines].filter((s) => s.length > 0);
  return sections.map((s) => s.join('\n')).join('\n\n');
}
