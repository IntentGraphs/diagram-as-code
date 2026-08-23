export type EventCategory = 'start' | 'intermediate' | 'end';

export type EventTrigger =
  | 'none' | 'message' | 'timer' | 'error' | 'escalation' | 'cancel'
  | 'compensation' | 'conditional' | 'link' | 'signal' | 'multiple'
  | 'parallelMultiple' | 'terminate';

/** Optional BPMN event-definition payloads that can survive a text/XML round trip. */
export interface EventDefinition {
  timerDate?: string;
  timerDuration?: string;
  timerCycle?: string;
  messageRef?: string;
  errorRef?: string;
  escalationRef?: string;
  signalRef?: string;
  condition?: string;
}

export type GatewayType = 'exclusive' | 'parallel' | 'inclusive' | 'complex' | 'eventBased';

export type TaskType =
  | 'task'
  | 'userTask'
  | 'serviceTask'
  | 'sendTask'
  | 'receiveTask'
  | 'manualTask'
  | 'businessRuleTask'
  | 'scriptTask';

export type ActivityType = TaskType | 'subProcess' | 'transaction' | 'callActivity';

export type FlowType = 'sequence' | 'conditionalSequence' | 'defaultSequence' | 'message' | 'association';

export interface Position {
  x: number;
  y: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export type EdgeCorner = 'sharp' | 'round';

export type LabelPlacementSide = 'above' | 'below' | 'left' | 'right';

export type NodeLabelPosition = 'inside' | 'below' | 'above' | 'left' | 'right';

export type FontSizeHint = 'small' | 'normal' | 'large';

export type LayoutSpacing = 'compact' | 'normal' | 'relaxed' | 'spacious';
/** Edge-routing quality/performance tradeoff for automatic layouts. */
export type RoutingMode = 'quality' | 'hybrid' | 'fast';

export type DiagramDirection = 'right' | 'left' | 'down' | 'up';
export type LaneDirection = 'horizontal' | 'vertical';
export type PaginationMode = 'none' | 'semantic' | 'tile' | 'hybrid';
export type PageBreakStrategy = 'pool' | 'lane' | 'group' | 'branch';

export const DEFAULT_BPMN_DIRECTION: DiagramDirection = 'right';
export const DEFAULT_BPMN_LANE_DIRECTION: LaneDirection = 'horizontal';
export const DEFAULT_FLOWCHART_DIRECTION: DiagramDirection = 'down';
export const DEFAULT_MINDMAP_DIRECTION: DiagramDirection = 'right';

export interface NodeVisual {
  label?: NodeLabelPosition;
  wrap?: 1 | 2 | 3 | 4 | 5;
  font?: FontSizeHint;
  align?: 'left' | 'center';
}

export interface EdgeLabelPlacement {
  at?: number;
  side?: LabelPlacementSide;
  offset?: Position;
}

export interface SizeHint {
  width: number;
  height: number;
}

/** Opt-in Camunda 7 vendor extensions; omitted on BPMN-only diagrams. */
export interface CamundaExtensions {
  class?: string;
  expression?: string;
  formKey?: string;
}

interface NodeCommon {
  position?: Position;
  sizeHint?: SizeHint;
  visual?: NodeVisual;
  camunda?: CamundaExtensions;
}

export interface EventNode extends NodeCommon {
  kind: 'event';
  id: string;
  label: string;
  category: EventCategory;
  trigger: EventTrigger;
  interrupting: boolean;
  eventDefinition?: EventDefinition;
  /** Set only for boundary events: the id of the activity this event is attached to. */
  attachedToId?: string;
}

export interface GatewayNode extends NodeCommon {
  kind: 'gateway';
  id: string;
  label: string;
  gatewayType: GatewayType;
}

export interface ActivityNode extends NodeCommon {
  kind: 'activity';
  id: string;
  label: string;
  activityType: ActivityType;
  collapsed: boolean;
  children: DiagramNode[];
  childEdges: DiagramEdge[];
}

export interface DataObjectNode extends NodeCommon {
  kind: 'dataObject';
  id: string;
  label: string;
}

export interface DataStoreNode extends NodeCommon {
  kind: 'dataStore';
  id: string;
  label: string;
}

export interface TextAnnotationNode extends NodeCommon {
  kind: 'textAnnotation';
  id: string;
  label: string;
}

export interface GroupNode extends NodeCommon {
  kind: 'group';
  id: string;
  label: string;
}

export type DiagramNode =
  | EventNode
  | GatewayNode
  | ActivityNode
  | DataObjectNode
  | DataStoreNode
  | TextAnnotationNode
  | GroupNode;

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  flowType: FlowType;
  /** Optional per-edge line style override; falls back to the flowType default when unset. */
  style?: EdgeStyle;
  /** Optional cosmetic corner-rounding override for orthogonal bends; sharp (today's default) when unset. */
  corner?: EdgeCorner;
  /** Optional override for which side of the source node this edge exits from; auto-picked when unset. */
  from?: Side;
  /** Optional override for which side of the target node this edge enters; auto-picked when unset. */
  to?: Side;
  /** Interior waypoints between exit and entry stubs (same coordinate rules as `at (x, y)`). */
  waypoints?: Position[];
  labelPlacement?: EdgeLabelPlacement;
}

export interface Lane {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface Pool {
  id: string;
  name: string;
  lanes: Lane[];
}

export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Optional output page contract. Layout remains in logical canvas units. */
  page?: {
    width: number;
    height: number;
    unit: 'in' | 'mm' | 'px';
    fit: 'contain' | 'strict';
  };
  /** Optional web-editor live-render policy; exports and CLI rendering ignore it. */
  renderMode?: 'auto' | 'manual';
  /**
   * Optional layout-engine name override (from a leading `layout: <name>` directive).
   * Unvalidated at parse-time — `selectEngine` resolves it against registered engines.
   */
  layout?: string;
  /** Optional diagram-level directive: 'manual' means every node must carry an explicit position and no layout engine runs. */
  positioning?: 'manual';
  /** Optional spacing preset for auto/manual padding; default engines behave as `normal`. */
  layoutSpacing?: LayoutSpacing;
  /** Optional automatic-routing profile; quality is the default and preserves edge separation. */
  routing?: RoutingMode;
  direction?: DiagramDirection;
  laneDirection?: LaneDirection;
  paginate?: PaginationMode;
  pageBreak?: PageBreakStrategy;
}

export function isEvent(node: DiagramNode): node is EventNode {
  return node.kind === 'event';
}
export function isBoundaryEvent(node: DiagramNode): node is EventNode {
  return node.kind === 'event' && node.attachedToId !== undefined;
}
export function isGateway(node: DiagramNode): node is GatewayNode {
  return node.kind === 'gateway';
}
export function isActivity(node: DiagramNode): node is ActivityNode {
  return node.kind === 'activity';
}
