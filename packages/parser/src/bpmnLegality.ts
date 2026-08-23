import type { Diagram, DiagramEdge, DiagramNode, EventNode, GatewayNode } from '@bpm/ast';
import { isActivity, isEvent, isGateway } from '@bpm/ast';
import type { EventCategory, EventTrigger } from '@bpm/ast';
import type { ParseError } from './errors.js';

export interface BpmnLegalityRule {
  id: string;
  /** BPMN 2.0.2 spec section/table citation for this rule. */
  specRef: string;
  /** Human-readable summary of what the rule enforces. */
  summary: string;
}

/** Illegal category × trigger pairs derived from BPMN 2.0.2 event-type tables. */
export interface CategoryTriggerRule extends BpmnLegalityRule {
  kind: 'categoryTrigger';
  category: EventCategory | 'boundary';
  forbiddenTriggers: readonly EventTrigger[];
  message: (trigger: EventTrigger, nodeId: string) => string;
}

/** Structural rules that involve gateways, hosts, or edge topology. */
export interface StructuralRule extends BpmnLegalityRule {
  kind: 'structural';
}

export type LegalityRule = CategoryTriggerRule | StructuralRule;

/**
 * BPMN 2.0.2 structural legality rules enforced after syntactic parse.
 * Each entry cites the spec table or section that defines the constraint.
 */
export const BPMN_LEGALITY_RULES: readonly LegalityRule[] = [
  {
    id: 'start-forbidden-triggers',
    kind: 'categoryTrigger',
    specRef: 'BPMN 2.0.2 §10.5.2 / Table 10.84 (Top-Level Process Start Event Types)',
    summary: 'Start events may only catch message, timer, conditional, signal, link, multiple, parallelMultiple, or none triggers.',
    category: 'start',
    forbiddenTriggers: ['error', 'escalation', 'cancel', 'compensation', 'terminate'],
    message: (trigger, nodeId) =>
      `Start event "${nodeId}" cannot use trigger "${trigger}" — BPMN 2.0 restricts ${trigger} to end or boundary events (Table 10.84)`,
  },
  {
    id: 'end-forbidden-triggers',
    kind: 'categoryTrigger',
    specRef: 'BPMN 2.0.2 §10.5.3 / Table 10.88 (End Event Types)',
    summary: 'End events may not use timer, conditional, or link triggers.',
    category: 'end',
    forbiddenTriggers: ['timer', 'conditional', 'link'],
    message: (trigger, nodeId) =>
      `End event "${nodeId}" cannot use trigger "${trigger}" — BPMN 2.0 end events do not support ${trigger} (Table 10.88)`,
  },
  {
    id: 'intermediate-forbidden-triggers',
    kind: 'categoryTrigger',
    specRef: 'BPMN 2.0.2 §10.5.4 / Table 10.89 (Intermediate Event Types in Normal Flow)',
    summary: 'Intermediate events in normal flow may not use error, cancel, or terminate triggers.',
    category: 'intermediate',
    forbiddenTriggers: ['error', 'cancel', 'terminate'],
    message: (trigger, nodeId) =>
      `Intermediate event "${nodeId}" cannot use trigger "${trigger}" — BPMN 2.0 restricts ${trigger} to end or boundary events (Table 10.89)`,
  },
  {
    id: 'boundary-forbidden-triggers',
    kind: 'categoryTrigger',
    specRef: 'BPMN 2.0.2 §10.5.4 / Table 10.90 (Intermediate Event Types Attached to an Activity Boundary)',
    summary: 'Boundary events must have an event definition; none, link, and terminate are not valid boundary triggers.',
    category: 'boundary',
    forbiddenTriggers: ['none', 'link', 'terminate'],
    message: (trigger, nodeId) =>
      `Boundary event "${nodeId}" cannot use trigger "${trigger}" — BPMN 2.0 boundary events require a defined trigger other than ${trigger} (Table 10.90)`,
  },
  {
    id: 'boundary-cancel-transaction-host',
    kind: 'structural',
    specRef: 'BPMN 2.0.2 §10.5.4 / Table 10.90 (Cancel boundary events attach only to transactions)',
    summary: 'Cancel boundary events may attach only to transaction activities.',
  },
  {
    id: 'event-gateway-intermediate-targets',
    kind: 'structural',
    specRef: 'BPMN 2.0.2 §10.6.6 / Table 10.127 (Event-Based Gateway outgoing flows target catch events or receive tasks)',
    summary: 'Outgoing sequence flows from an event-based gateway must target intermediate catch events or receive tasks.',
  },
] as const;

function collectNodes(nodes: DiagramNode[], out: DiagramNode[] = []): DiagramNode[] {
  for (const node of nodes) {
    out.push(node);
    if (isActivity(node) && node.children.length > 0) {
      collectNodes(node.children, out);
    }
  }
  return out;
}

function collectEdges(edges: DiagramEdge[], nodes: DiagramNode[], out: DiagramEdge[] = []): DiagramEdge[] {
  out.push(...edges);
  for (const node of nodes) {
    if (isActivity(node) && node.childEdges.length > 0) {
      collectEdges(node.childEdges, node.children, out);
    }
  }
  return out;
}

function categoryTriggerRules(): CategoryTriggerRule[] {
  return BPMN_LEGALITY_RULES.filter((r): r is CategoryTriggerRule => r.kind === 'categoryTrigger');
}

function checkCategoryTriggerRules(
  event: EventNode,
  line: number,
  hostById: Map<string, DiagramNode>,
): ParseError[] {
  const errors: ParseError[] = [];
  const category: EventCategory | 'boundary' =
    event.attachedToId !== undefined ? 'boundary' : event.category;
  for (const rule of categoryTriggerRules()) {
    if (rule.category !== category) continue;
    if (!rule.forbiddenTriggers.includes(event.trigger)) continue;
    errors.push({
      line,
      column: 1,
      message: rule.message(event.trigger, event.id),
    });
  }

  if (event.attachedToId !== undefined && event.trigger === 'cancel') {
    const host = hostById.get(event.attachedToId);
    if (host && isActivity(host) && host.activityType !== 'transaction') {
      errors.push({
        line,
        column: 1,
        message: `Cancel boundary event "${event.id}" must attach to a transaction activity — host "${host.id}" is a ${host.activityType} (Table 10.90)`,
      });
    }
  }

  return errors;
}

function isEventGatewayTarget(node: DiagramNode | undefined): boolean {
  if (!node) return false;
  if (node.kind === 'event' && node.category === 'intermediate' && node.attachedToId === undefined) {
    return true;
  }
  return node.kind === 'activity' && node.activityType === 'receiveTask';
}

function checkEventGatewayTargets(
  diagram: Diagram,
  nodeById: Map<string, DiagramNode>,
  edgeSourceLines: Map<string, number>,
): ParseError[] {
  const errors: ParseError[] = [];
  const allNodes = collectNodes(diagram.nodes);
  const allEdges = collectEdges(diagram.edges, diagram.nodes);
  const eventGateways = allNodes.filter((n): n is GatewayNode => isGateway(n) && n.gatewayType === 'eventBased');

  for (const gateway of eventGateways) {
    const outgoing = allEdges.filter(
      (e) => e.sourceId === gateway.id && e.flowType !== 'message' && e.flowType !== 'association',
    );
    for (const edge of outgoing) {
      const target = nodeById.get(edge.targetId);
      if (isEventGatewayTarget(target)) {
        continue;
      }
      const line = edgeSourceLines.get(edge.id) ?? 1;
      let targetKind = 'unknown node';
      if (target !== undefined) {
        if (target.kind === 'event') {
          targetKind = `event ${target.category}`;
        } else if (target.kind === 'activity') {
          targetKind = target.activityType;
        } else {
          targetKind = target.kind;
        }
      }
      errors.push({
        line,
        column: 1,
        message: `Event-based gateway "${gateway.id}" outgoing flow to "${edge.targetId}" (${targetKind}) is invalid — BPMN 2.0 requires targets to be intermediate catch events or receive tasks (§10.6.6)`,
      });
    }
  }

  return errors;
}

export interface LegalityContext {
  nodeSourceLines: Map<string, number>;
  edgeSourceLines: Map<string, number>;
}

export function checkBpmnLegality(diagram: Diagram, ctx: LegalityContext): ParseError[] {
  const errors: ParseError[] = [];
  const allNodes = collectNodes(diagram.nodes);
  const allEdges = collectEdges(diagram.edges, diagram.nodes);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));

  for (const node of allNodes) {
    if (!isEvent(node)) continue;
    const line = ctx.nodeSourceLines.get(node.id) ?? 1;
    errors.push(...checkCategoryTriggerRules(node, line, nodeById));
  }

  errors.push(...checkEventGatewayTargets(diagram, nodeById, ctx.edgeSourceLines));
  for (const edge of allEdges) {
    if (edge.sourceId !== edge.targetId || edge.flowType === 'association') continue;
    errors.push({
      line: ctx.edgeSourceLines.get(edge.id) ?? 1,
      column: 1,
      message: `Edge "${edge.id}" cannot connect node "${edge.sourceId}" to itself — self-loops are not valid BPMN control flows`,
      code: 'self_loop',
    });
  }
  return errors;
}
