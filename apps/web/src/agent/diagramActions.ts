export interface AgentPoint {
  x: number;
  y: number;
}

export type AgentShapeType =
  | 'bpmn:Task'
  | 'bpmn:UserTask'
  | 'bpmn:ServiceTask'
  | 'bpmn:StartEvent'
  | 'bpmn:EndEvent'
  | 'bpmn:IntermediateThrowEvent'
  | 'bpmn:ExclusiveGateway'
  | 'bpmn:ParallelGateway'
  | 'bpmn:Participant'
  | 'bpmn:Lane';

export type AgentFlowType = 'bpmn:SequenceFlow' | 'bpmn:MessageFlow' | 'bpmn:Association';

export interface AgentNodeSnapshot {
  id: string;
  type: AgentShapeType | string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  container: boolean;
}

export interface AgentEdgeSnapshot {
  id: string;
  type: AgentFlowType | string;
  sourceId: string;
  targetId: string;
  points: AgentPoint[];
}

export interface AgentDiagramState {
  nodes: AgentNodeSnapshot[];
  edges: AgentEdgeSnapshot[];
}

export type DiagramAction =
  | {
      type: 'createShape';
      id: string;
      shapeType: AgentShapeType;
      label?: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      parentId?: string;
    }
  | { type: 'moveShape'; id: string; x: number; y: number }
  | { type: 'updateLabel'; id: string; label: string }
  | {
      type: 'connect';
      id: string;
      sourceId: string;
      targetId: string;
      flowType: AgentFlowType;
      waypoints?: AgentPoint[];
    }
  | { type: 'routeEdge'; id: string; preference: 'direct' | 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'setWaypoints'; id: string; waypoints: AgentPoint[] }
  | { type: 'deleteElements'; ids: string[] };

export interface AgentPlan {
  title: string;
  explanation: string;
  actions: DiagramAction[];
}

export interface AgentGeometryReport {
  nodeOverlaps: string[];
  edgeThroughNode: string[];
  edgeCrossings: string[];
  endpointErrors: string[];
  nonOrthogonalEdges: string[];
  hardValid: boolean;
}

const MAX_PLAN_ACTIONS = 120;
const MAX_ID_LENGTH = 80;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function validPoint(point: AgentPoint): boolean {
  return finite(point.x) && finite(point.y);
}

export function validateAction(action: DiagramAction): string[] {
  const errors: string[] = [];
  if (!action || typeof action !== 'object') return ['Action must be an object'];
  if (!('type' in action) || typeof action.type !== 'string') return ['Action type is required'];

  const checkId = (id: string | undefined, field: string): void => {
    if (!id || id.length > MAX_ID_LENGTH || /[\r\n]/.test(id)) errors.push(`${field} must be a short, single-line id`);
  };

  if (action.type === 'createShape') {
    checkId(action.id, 'createShape.id');
    if (!finite(action.x) || !finite(action.y)) errors.push('createShape coordinates must be finite');
    if (action.width !== undefined && (!finite(action.width) || action.width <= 0)) errors.push('createShape.width must be positive');
    if (action.height !== undefined && (!finite(action.height) || action.height <= 0)) errors.push('createShape.height must be positive');
    if (action.parentId) checkId(action.parentId, 'createShape.parentId');
  } else if (action.type === 'moveShape') {
    checkId(action.id, 'moveShape.id');
    if (!finite(action.x) || !finite(action.y)) errors.push('moveShape coordinates must be finite');
  } else if (action.type === 'updateLabel') {
    checkId(action.id, 'updateLabel.id');
    if (typeof action.label !== 'string' || action.label.length > 500) errors.push('updateLabel.label must be a short string');
  } else if (action.type === 'connect') {
    checkId(action.id, 'connect.id');
    checkId(action.sourceId, 'connect.sourceId');
    checkId(action.targetId, 'connect.targetId');
    if (action.sourceId === action.targetId) errors.push('A connection cannot connect an element to itself');
    if (action.waypoints && (action.waypoints.length > 40 || action.waypoints.some((point) => !validPoint(point)))) {
      errors.push('connect.waypoints must contain at most 40 finite points');
    }
  } else if (action.type === 'routeEdge') {
    checkId(action.id, 'routeEdge.id');
    if (!['direct', 'top', 'bottom', 'left', 'right'].includes(action.preference)) errors.push('routeEdge.preference is invalid');
  } else if (action.type === 'setWaypoints') {
    checkId(action.id, 'setWaypoints.id');
    if (action.waypoints.length > 40 || action.waypoints.some((point) => !validPoint(point))) errors.push('setWaypoints.waypoints must contain at most 40 finite points');
  } else if (action.type === 'deleteElements') {
    if (action.ids.length === 0 || action.ids.length > 40) errors.push('deleteElements.ids must contain 1–40 ids');
    action.ids.forEach((id) => checkId(id, 'deleteElements.ids'));
  }
  return errors;
}

export function validatePlan(plan: AgentPlan): string[] {
  const errors: string[] = [];
  if (!plan || typeof plan !== 'object') return ['Plan must be an object'];
  if (typeof plan.title !== 'string' || plan.title.length > 160) errors.push('Plan title is invalid');
  if (typeof plan.explanation !== 'string' || plan.explanation.length > 2000) errors.push('Plan explanation is invalid');
  if (!Array.isArray(plan.actions) || plan.actions.length > MAX_PLAN_ACTIONS) errors.push(`Plan must contain at most ${MAX_PLAN_ACTIONS} actions`);
  for (const [index, action] of (plan.actions ?? []).entries()) {
    for (const error of validateAction(action)) errors.push(`Action ${index + 1}: ${error}`);
  }
  return errors;
}

export function actionDescription(action: DiagramAction): string {
  switch (action.type) {
    case 'createShape': return `Create ${action.shapeType.replace('bpmn:', '')} “${action.label ?? action.id}”`;
    case 'moveShape': return `Move ${action.id} to (${Math.round(action.x)}, ${Math.round(action.y)})`;
    case 'updateLabel': return `Rename ${action.id} to “${action.label}”`;
    case 'connect': return `Connect ${action.sourceId} → ${action.targetId}`;
    case 'routeEdge': return `Route ${action.id} using the ${action.preference} corridor`;
    case 'setWaypoints': return `Reroute ${action.id} through ${action.waypoints.length} waypoint(s)`;
    case 'deleteElements': return `Delete ${action.ids.join(', ')}`;
  }
}

export function planFromDescription(description: string): AgentPlan {
  const labels = description
    .split(/\s*(?:->|→| then |, then )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);
  const steps = labels.length > 0 ? labels : ['Review request'];
  const actions: DiagramAction[] = [
    { type: 'createShape', id: 'agent-start', shapeType: 'bpmn:StartEvent', label: 'Start', x: 140, y: 220 },
  ];
  steps.forEach((label, index) => {
    actions.push({ type: 'createShape', id: `agent-task-${index + 1}`, shapeType: 'bpmn:Task', label, x: 240 + index * 180, y: 200 });
  });
  actions.push({ type: 'createShape', id: 'agent-end', shapeType: 'bpmn:EndEvent', label: 'End', x: 300 + steps.length * 180, y: 220 });
  const chain = ['agent-start', ...steps.map((_, index) => `agent-task-${index + 1}`), 'agent-end'];
  for (let index = 0; index < chain.length - 1; index++) {
    actions.push({ type: 'connect', id: `agent-flow-${index + 1}`, sourceId: chain[index], targetId: chain[index + 1], flowType: 'bpmn:SequenceFlow' });
  }
  return {
    title: 'Manual BPMN draft',
    explanation: 'This offline draft uses explicit positions and sequence flows. Review each step in the diagram editor before saving.',
    actions,
  };
}
