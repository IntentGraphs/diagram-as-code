import type { EventCategory, EventTrigger, GatewayType, FlowType, EdgeStyle, EdgeCorner, Side } from '@bpm/ast';

export const EVENT_CATEGORIES: EventCategory[] = ['start', 'intermediate', 'end'];

export const EVENT_TRIGGERS: EventTrigger[] = [
  'none', 'message', 'timer', 'error', 'escalation', 'cancel',
  'compensation', 'conditional', 'link', 'signal', 'multiple',
  'parallelMultiple', 'terminate',
];

export const GATEWAY_TYPES: GatewayType[] = ['exclusive', 'parallel', 'inclusive', 'complex', 'eventBased'];

export const EDGE_ARROW_TO_FLOW_TYPE: Record<string, FlowType> = {
  '->': 'sequence',
  '=>': 'conditionalSequence',
  '->>': 'defaultSequence',
  '~>': 'message',
  '..>': 'association',
};

export function isEventCategory(token: string): token is EventCategory {
  return (EVENT_CATEGORIES as string[]).includes(token);
}
export function isEventTrigger(token: string): token is EventTrigger {
  return (EVENT_TRIGGERS as string[]).includes(token);
}
export function isGatewayType(token: string): token is GatewayType {
  return (GATEWAY_TYPES as string[]).includes(token);
}

export const EDGE_STYLES: EdgeStyle[] = ['solid', 'dashed', 'dotted'];
export const EDGE_CORNERS: EdgeCorner[] = ['sharp', 'round'];
export const EDGE_SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

export function isEdgeStyle(token: string): token is EdgeStyle {
  return (EDGE_STYLES as string[]).includes(token);
}
export function isEdgeCorner(token: string): token is EdgeCorner {
  return (EDGE_CORNERS as string[]).includes(token);
}
export function isEdgeSide(token: string): token is Side {
  return (EDGE_SIDES as string[]).includes(token);
}

/** User-facing node / host ids: BPMN-safe XML Name subset. */
const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}
