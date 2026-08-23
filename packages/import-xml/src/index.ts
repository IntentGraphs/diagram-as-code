import BpmnModdle, { type ModdleElement } from 'bpmn-moddle';
import { printDiagram } from '@bpm/print-dsl';
import type {
  Diagram, DiagramNode, DiagramEdge, Pool, Lane,
  EventCategory, EventTrigger, GatewayType, ActivityType, TaskType, FlowType, Position, Side,
  EventDefinition,
} from '@bpm/ast';

export interface ImportXmlResult {
  diagram: Diagram;
  text: string;
  warnings: string[];
  /** Structured accounting of what survived the XML-to-text conversion. */
  lossReport: ImportLossReport;
}

export type ImportLossKind = 'preserved' | 'transformed' | 'dropped';

export interface ImportLossEntry {
  kind: Exclude<ImportLossKind, 'preserved'>;
  sourceType: string;
  id?: string;
  message: string;
}

export interface ImportLossReport {
  preserved: number;
  transformed: number;
  dropped: number;
  entries: ImportLossEntry[];
}

export interface ImportXmlOptions {
  signal?: AbortSignal;
  /** Maximum time spent in the BPMN moddle parser. Defaults to 10 seconds. */
  timeoutMs?: number;
}

/** Input budgets keep browser imports predictable while allowing ordinary exported BPMN files. */
export const IMPORT_LIMITS = {
  xmlBytes: 8 * 1024 * 1024,
  xmlElements: 20_000,
  xmlDepth: 128,
  timeoutMs: 10_000,
  coordinate: 10_000_000,
  dimension: 1_000_000,
  waypointsPerEdge: 4096,
} as const;

function scanXmlBudget(xml: string): void {
  let cursor = 0;
  let depth = 0;
  let elements = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor);
    if (start < 0) break;
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4);
      if (end < 0) throw new Error('BPMN XML contains an unterminated comment');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9);
      if (end < 0) throw new Error('BPMN XML contains an unterminated CDATA section');
      cursor = end + 3;
      continue;
    }
    let end = start + 1;
    let quote = '';
    while (end < xml.length) {
      const character = xml[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      end += 1;
    }
    if (end >= xml.length) throw new Error('BPMN XML contains an unterminated tag');
    const tag = xml.slice(start + 1, end).trim();
    if (tag.startsWith('/')) {
      depth = Math.max(0, depth - 1);
    } else if (!tag.startsWith('?') && !tag.startsWith('!')) {
      elements += 1;
      if (elements > IMPORT_LIMITS.xmlElements) {
        throw new Error(`BPMN XML exceeds the ${IMPORT_LIMITS.xmlElements}-element import limit`);
      }
      depth += 1;
      if (depth > IMPORT_LIMITS.xmlDepth) {
        throw new Error(`BPMN XML exceeds the ${IMPORT_LIMITS.xmlDepth}-level nesting limit`);
      }
      if (tag.endsWith('/')) depth -= 1;
    }
    cursor = end + 1;
  }
}

function cancelledImport(): Error {
  return new Error('BPMN XML import cancelled');
}

async function parseWithControls(
  moddle: BpmnModdle,
  xml: string,
  options: ImportXmlOptions,
): Promise<{ rootElement: ModdleElement; warnings: Array<{ message: string }> }> {
  if (options.signal?.aborted) throw cancelledImport();
  const timeoutMs = options.timeoutMs ?? IMPORT_LIMITS.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('BPMN XML import timeout must be positive');
  const parse = moddle.fromXML(xml);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const controls: Promise<never>[] = [];
  if (options.signal) {
    controls.push(new Promise<never>((_, reject) => {
      onAbort = () => reject(cancelledImport());
      options.signal?.addEventListener('abort', onAbort, { once: true });
    }));
  }
  controls.push(new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`BPMN XML import exceeded the ${timeoutMs}ms timeout`)), timeoutMs);
  }));
  try {
    return await Promise.race([parse, ...controls]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
  }
}

const TASK_TYPE_BY_XML_TYPE: Record<string, TaskType> = {
  'bpmn:Task': 'task',
  'bpmn:UserTask': 'userTask',
  'bpmn:ServiceTask': 'serviceTask',
  'bpmn:SendTask': 'sendTask',
  'bpmn:ReceiveTask': 'receiveTask',
  'bpmn:ManualTask': 'manualTask',
  'bpmn:BusinessRuleTask': 'businessRuleTask',
  'bpmn:ScriptTask': 'scriptTask',
};

const GATEWAY_TYPE_BY_XML_TYPE: Record<string, GatewayType> = {
  'bpmn:ExclusiveGateway': 'exclusive',
  'bpmn:ParallelGateway': 'parallel',
  'bpmn:InclusiveGateway': 'inclusive',
  'bpmn:ComplexGateway': 'complex',
  'bpmn:EventBasedGateway': 'eventBased',
};

const TRIGGER_BY_DEFINITION_TYPE: Record<string, EventTrigger> = {
  'bpmn:MessageEventDefinition': 'message',
  'bpmn:TimerEventDefinition': 'timer',
  'bpmn:ErrorEventDefinition': 'error',
  'bpmn:EscalationEventDefinition': 'escalation',
  'bpmn:CancelEventDefinition': 'cancel',
  'bpmn:CompensateEventDefinition': 'compensation',
  'bpmn:ConditionalEventDefinition': 'conditional',
  'bpmn:LinkEventDefinition': 'link',
  'bpmn:SignalEventDefinition': 'signal',
  'bpmn:TerminateEventDefinition': 'terminate',
};

const EVENT_CATEGORY_BY_XML_TYPE: Record<string, EventCategory> = {
  'bpmn:StartEvent': 'start',
  'bpmn:EndEvent': 'end',
  'bpmn:IntermediateCatchEvent': 'intermediate',
  'bpmn:IntermediateThrowEvent': 'intermediate',
};

const ID_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Resolves every element id to one valid in this DSL's grammar, renaming (and warning about) any that aren't. */
class IdMap {
  private used = new Set<string>();
  private renamed = new Map<string, string>();

  constructor(private warnings: string[], private onRename?: (rawId: string, resolvedId: string) => void) {}

  resolve(rawId: string | undefined, fallbackPrefix: string): string {
    if (rawId && ID_RE.test(rawId) && !this.used.has(rawId)) {
      this.used.add(rawId);
      return rawId;
    }
    const cleaned = (rawId ?? '').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^[^A-Za-z_]+/, '');
    const base = cleaned || fallbackPrefix;
    let candidate = base;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    this.used.add(candidate);
    if (rawId) {
      this.renamed.set(rawId, candidate);
      this.warnings.push(`Element id "${rawId}" is not valid in this DSL — renamed to "${candidate}"`);
      this.onRename?.(rawId, candidate);
    }
    return candidate;
  }

  get(rawId: string): string {
    return this.renamed.get(rawId) ?? rawId;
  }
}

interface DiPositions {
  bounds: Map<string, { x: number; y: number; width: number; height: number }>;
  waypoints: Map<string, Position[]>;
}

function collectDiPositions(rootElement: ModdleElement, warnings: string[]): DiPositions {
  const bounds: DiPositions['bounds'] = new Map();
  const waypoints: DiPositions['waypoints'] = new Map();
  let warnedNumbers = false;
  const warnNumbers = () => {
    if (!warnedNumbers) {
      warnings.push('Some BPMN diagram-interchange coordinates were outside safe numeric bounds and were ignored');
      warnedNumbers = true;
    }
  };
  const coordinate = (value: unknown): number | undefined => {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= IMPORT_LIMITS.coordinate ? number : undefined;
  };
  const diagrams = (rootElement.diagrams as ModdleElement[] | undefined) ?? [];
  for (const diagram of diagrams) {
    const plane = diagram.plane as ModdleElement | undefined;
    const planeElements = (plane?.planeElement as ModdleElement[] | undefined) ?? [];
    for (const el of planeElements) {
      const target = el.bpmnElement as ModdleElement | undefined;
      if (!target?.id) continue;
      if (el.$type === 'bpmndi:BPMNShape' && el.bounds) {
        const b = el.bounds as ModdleElement;
        const x = coordinate(b.x);
        const y = coordinate(b.y);
        const width = Number(b.width);
        const height = Number(b.height);
        if (x === undefined || y === undefined || !Number.isFinite(width) || !Number.isFinite(height)
          || width < 0 || height < 0 || width > IMPORT_LIMITS.dimension || height > IMPORT_LIMITS.dimension) {
          warnNumbers();
        } else {
          bounds.set(target.id, { x, y, width, height });
        }
      } else if (el.$type === 'bpmndi:BPMNEdge' && Array.isArray(el.waypoint)) {
        if (el.waypoint.length > IMPORT_LIMITS.waypointsPerEdge) warnNumbers();
        const points = (el.waypoint as ModdleElement[]).slice(0, IMPORT_LIMITS.waypointsPerEdge)
          .map((p) => ({ x: coordinate(p.x), y: coordinate(p.y) }))
          .filter((p): p is { x: number; y: number } => p.x !== undefined && p.y !== undefined);
        if (points.length > 0) waypoints.set(target.id, points);
      }
    }
  }
  return { bounds, waypoints };
}

function deriveTrigger(el: ModdleElement): EventTrigger {
  if (el.parallelMultiple) return 'parallelMultiple';
  const defs = (el.eventDefinitions as ModdleElement[] | undefined) ?? [];
  if (defs.length > 1) return 'multiple';
  if (defs.length === 0) return 'none';
  return TRIGGER_BY_DEFINITION_TYPE[defs[0].$type] ?? 'none';
}

function readEventDefinition(el: ModdleElement): EventDefinition | undefined {
  const definition = ((el.eventDefinitions as ModdleElement[] | undefined) ?? [])[0];
  if (!definition) return undefined;
  const result: EventDefinition = {};
  if (definition.$type === 'bpmn:TimerEventDefinition') {
    if (definition.timeDate) result.timerDate = String((definition.timeDate as ModdleElement).body ?? definition.timeDate);
    if (definition.timeDuration) result.timerDuration = String((definition.timeDuration as ModdleElement).body ?? definition.timeDuration);
    if (definition.timeCycle) result.timerCycle = String((definition.timeCycle as ModdleElement).body ?? definition.timeCycle);
  } else if (definition.$type === 'bpmn:MessageEventDefinition' && definition.messageRef) {
    result.messageRef = String((definition.messageRef as ModdleElement).id ?? definition.messageRef);
  } else if (definition.$type === 'bpmn:ErrorEventDefinition' && definition.errorRef) {
    result.errorRef = String((definition.errorRef as ModdleElement).id ?? definition.errorRef);
  } else if (definition.$type === 'bpmn:EscalationEventDefinition' && definition.escalationRef) {
    result.escalationRef = String((definition.escalationRef as ModdleElement).id ?? definition.escalationRef);
  } else if (definition.$type === 'bpmn:SignalEventDefinition' && definition.signalRef) {
    result.signalRef = String((definition.signalRef as ModdleElement).id ?? definition.signalRef);
  } else if (definition.$type === 'bpmn:ConditionalEventDefinition' && definition.condition) {
    const condition = definition.condition as ModdleElement;
    if (condition.body) result.condition = String(condition.body);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function readCamunda(el: ModdleElement): { class?: string; expression?: string; formKey?: string } | undefined {
  const attrs = el.$attrs;
  if (!attrs) return undefined;
  const camunda: { class?: string; expression?: string; formKey?: string } = {};
  let has = false;
  if (attrs['camunda:class']) { camunda.class = attrs['camunda:class']; has = true; }
  if (attrs['camunda:expression']) { camunda.expression = attrs['camunda:expression']; has = true; }
  if (attrs['camunda:formKey']) { camunda.formKey = attrs['camunda:formKey']; has = true; }
  return has ? camunda : undefined;
}

interface MapContext {
  ids: IdMap;
  di: DiPositions;
  warnings: string[];
  losses: LossAccumulator;
}

interface LossAccumulator {
  preserved: number;
  transformed: number;
  dropped: number;
  entries: ImportLossEntry[];
}

const MAX_LOSS_ENTRIES = 256;

function recordPreserved(ctx: MapContext): void {
  ctx.losses.preserved += 1;
}

function recordLoss(
  ctx: MapContext,
  kind: Exclude<ImportLossKind, 'preserved'>,
  sourceType: string,
  message: string,
  id?: string,
): void {
  ctx.losses[kind] += 1;
  if (ctx.losses.entries.length < MAX_LOSS_ENTRIES) {
    ctx.losses.entries.push({ kind, sourceType, ...(id ? { id } : {}), message });
  }
}

function recordEventDefinitionLoss(el: ModdleElement, ctx: MapContext): void {
  const definitions = (el.eventDefinitions as ModdleElement[] | undefined) ?? [];
  for (const definition of definitions) {
    const details: string[] = [];
    if (definition.$type === 'bpmn:LinkEventDefinition' && (definition.name || definition.target)) {
      details.push('link target/name');
    } else if (definition.$type === 'bpmn:CompensateEventDefinition' && definition.activityRef) {
      details.push('activityRef');
    }
    if (details.length > 0) {
      recordLoss(ctx, 'transformed', definition.$type, `${definition.$type} ${details.join(', ')} is represented only by the event trigger in .bpm text`, el.id);
    }
  }
}

function recordActivitySemanticLoss(el: ModdleElement, ctx: MapContext): void {
  if (el.loopCharacteristics) {
    recordLoss(ctx, 'transformed', 'bpmn:loopCharacteristics', 'Loop or multi-instance execution semantics are not represented in .bpm text', el.id);
  }
  if (el.isForCompensation) {
    recordLoss(ctx, 'transformed', el.$type, 'Compensation activity metadata is not represented in .bpm text', el.id);
  }
}

/**
 * Matches packages/layout-engine-manual/src/engine.ts's SUBPROCESS_PADDING /
 * SUBPROCESS_HEADER_INSET_Y exactly — an expanded subprocess's children are positioned relative
 * to (subprocess origin + this inset), not canvas-absolute (docs/LANGUAGE.md §6.5), so DI's
 * absolute bounds must be converted back to that relative frame or the layout engine rejects the
 * result as an overlap (found via apps/web/test/e2e/diagram-import-roundtrip.spec.ts).
 */
const SUBPROCESS_CONTENT_PADDING = { x: 12, y: 20 };

function mapNode(el: ModdleElement, ctx: MapContext, originOffset: Position): DiagramNode | null {
  const id = ctx.ids.get(el.id!);
  const label = (el.name as string | undefined) ?? '';
  const bounds = ctx.di.bounds.get(el.id!);
  const position = bounds ? { x: bounds.x - originOffset.x, y: bounds.y - originOffset.y } : undefined;
  const sizeHint = bounds ? { width: bounds.width, height: bounds.height } : undefined;

  if (el.$type === 'bpmn:BoundaryEvent') {
    const hostRef = el.attachedToRef as ModdleElement | undefined;
    if (!hostRef?.id) {
      ctx.warnings.push(`Boundary event "${el.id}" has no attachedToRef — skipped`);
      return null;
    }
    recordEventDefinitionLoss(el, ctx);
    const eventDefinition = readEventDefinition(el);
    return {
      kind: 'event', id, label, category: 'intermediate', trigger: deriveTrigger(el),
      interrupting: el.cancelActivity !== false, attachedToId: ctx.ids.get(hostRef.id),
      ...(eventDefinition ? { eventDefinition } : {}),
    };
  }

  const category = EVENT_CATEGORY_BY_XML_TYPE[el.$type];
  if (category) {
    if (el.$type === 'bpmn:IntermediateThrowEvent') {
      recordLoss(ctx, 'transformed', el.$type, 'Intermediate throw event is represented as an intermediate catch event in .bpm text', el.id);
    }
    recordEventDefinitionLoss(el, ctx);
    const eventDefinition = readEventDefinition(el);
    return {
      kind: 'event', id, label, category, trigger: deriveTrigger(el), interrupting: true, position, sizeHint,
      ...(eventDefinition ? { eventDefinition } : {}),
    };
  }

  const gatewayType = GATEWAY_TYPE_BY_XML_TYPE[el.$type];
  if (gatewayType) {
    return { kind: 'gateway', id, label, gatewayType, position, sizeHint };
  }

  const taskType = TASK_TYPE_BY_XML_TYPE[el.$type];
  if (taskType) {
    recordActivitySemanticLoss(el, ctx);
    const camunda = readCamunda(el);
    return {
      kind: 'activity', id, label, activityType: taskType, collapsed: false, children: [], childEdges: [],
      position, sizeHint, ...(camunda ? { camunda } : {}),
    };
  }

  if (el.$type === 'bpmn:SubProcess' || el.$type === 'bpmn:Transaction') {
    recordActivitySemanticLoss(el, ctx);
    const activityType: ActivityType = el.$type === 'bpmn:Transaction' ? 'transaction' : 'subProcess';
    const childFlowElements = (el.flowElements as ModdleElement[] | undefined) ?? [];
    const childArtifacts = (el.artifacts as ModdleElement[] | undefined) ?? [];
    // Children's origin is this subprocess's own ABSOLUTE bounds (not its post-offset printed
    // position) plus the fixed content inset — see SUBPROCESS_CONTENT_PADDING above.
    const childOrigin: Position = bounds
      ? { x: bounds.x + SUBPROCESS_CONTENT_PADDING.x, y: bounds.y + SUBPROCESS_CONTENT_PADDING.y }
      : { x: 0, y: 0 };
    const { nodes: children, edges: childEdges } = mapFlowElementsAndArtifacts(childFlowElements, childArtifacts, ctx, childOrigin);
    return {
      kind: 'activity', id, label, activityType, collapsed: false, children, childEdges, position, sizeHint,
    };
  }

  if (el.$type === 'bpmn:CallActivity') {
    recordActivitySemanticLoss(el, ctx);
    if (el.calledElement || el.calledElementBinding) {
      recordLoss(ctx, 'transformed', el.$type, 'Call activity target/binding is not represented in .bpm text', el.id);
    }
    return { kind: 'activity', id, label, activityType: 'callActivity', collapsed: false, children: [], childEdges: [], position, sizeHint };
  }

  if (el.$type === 'bpmn:DataObjectReference') {
    return { kind: 'dataObject', id, label, position, sizeHint };
  }
  if (el.$type === 'bpmn:DataObject') {
    return null; // only the reference is a visible node; see the export mapping this inverts
  }
  if (el.$type === 'bpmn:DataStoreReference') {
    return { kind: 'dataStore', id, label, position, sizeHint };
  }
  if (el.$type === 'bpmn:TextAnnotation') {
    return { kind: 'textAnnotation', id, label: (el.text as string | undefined) ?? '', position, sizeHint };
  }
  if (el.$type === 'bpmn:Group') {
    return { kind: 'group', id, label: '', position, sizeHint };
  }

  return null;
}

function trimWaypointsToVia(points: Position[] | undefined): Position[] | undefined {
  if (!points || points.length <= 2) return undefined;
  const interior = points.slice(1, -1);
  return interior.length > 0 ? interior : undefined;
}

/**
 * Which side of `rect` a DI waypoint was docked against, using the same center-relative,
 * axis-dominance test @bpm/layout-core's `facingSides`/`outlineAnchor` use for freshly computed
 * anchors. Re-deriving it here (rather than leaving `edge.from`/`to` unset) lets a later
 * `overridePinnedNodes` reroute — triggered by any edit that moves a node — exit/enter from the
 * SAME side the original diagram used, instead of `facingSides`' cruder source→target center
 * heuristic, which knows nothing about the obstacle-avoiding route the original full layout chose
 * and otherwise reattaches stale interior waypoints to a freshly (and often wrongly) sided anchor,
 * producing a visibly diagonal kink at the first/last segment.
 */
function inferSide(point: Position, rect: { x: number; y: number; width: number; height: number }): Side {
  const halfW = rect.width / 2 || 1;
  const halfH = rect.height / 2 || 1;
  const nx = (point.x - (rect.x + halfW)) / halfW;
  const ny = (point.y - (rect.y + halfH)) / halfH;
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'right' : 'left';
  return ny >= 0 ? 'bottom' : 'top';
}

function mapEdge(el: ModdleElement, ctx: MapContext, flowType: FlowType, defaultSourceIds: Set<string>, originOffset: Position): DiagramEdge | null {
  const sourceRef = el.sourceRef as ModdleElement | undefined;
  const targetRef = el.targetRef as ModdleElement | undefined;
  if (!sourceRef?.id || !targetRef?.id) {
    ctx.warnings.push(`Flow "${el.id}" is missing a source or target — skipped`);
    return null;
  }
  const resolvedFlowType: FlowType = flowType === 'sequence' && defaultSourceIds.has(el.id!) ? 'defaultSequence'
    : flowType === 'sequence' && el.conditionExpression ? 'conditionalSequence'
    : flowType;
  // The DSL currently has one edge label field. For conditional sequence flows, the
  // condition body is the semantically important value and must take precedence over
  // BPMN's optional display name; otherwise Import to Text preserves only the arrow
  // kind and silently drops the condition expression.
  const conditionBody = (el.conditionExpression as ModdleElement | undefined)?.body;
  const edgeLabel = typeof conditionBody === 'string'
    ? conditionBody
    : typeof el.name === 'string' ? el.name : undefined;
  const fullWaypoints = ctx.di.waypoints.get(el.id!);
  const rawWaypoints = trimWaypointsToVia(fullWaypoints);
  const waypoints = rawWaypoints?.map((p) => ({ x: p.x - originOffset.x, y: p.y - originOffset.y }));

  const sourceBounds = ctx.di.bounds.get(sourceRef.id);
  const targetBounds = ctx.di.bounds.get(targetRef.id);
  const from = fullWaypoints && fullWaypoints.length >= 2 && sourceBounds
    ? inferSide(fullWaypoints[0], sourceBounds) : undefined;
  const to = fullWaypoints && fullWaypoints.length >= 2 && targetBounds
    ? inferSide(fullWaypoints[fullWaypoints.length - 1], targetBounds) : undefined;

  return {
    id: ctx.ids.get(el.id!),
    sourceId: ctx.ids.get(sourceRef.id),
    targetId: ctx.ids.get(targetRef.id),
    ...(edgeLabel !== undefined ? { label: edgeLabel } : {}),
    flowType: resolvedFlowType,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(waypoints ? { waypoints } : {}),
  };
}

/**
 * A data-object-to-task connection drawn with bpmn-js's own palette isn't a top-level
 * `bpmn:Association` (the shape @bpm/export-xml itself produces for "..>") — it's a
 * `dataInputAssociation`/`dataOutputAssociation` nested *inside* the activity element, whose
 * `targetRef`/`sourceRef` (respectively) points at an internal `bpmn:Property` placeholder, not
 * the activity itself. The activity's own id is the real semantic endpoint. Missing this meant
 * these connections were invisible to the importer entirely — not even reaching the "unsupported
 * element" warning, since nothing ever looked inside an activity for them (found via a real user
 * round trip, verified by the import/export contract tests.
 * fidelity checking, roadmap item 16).
 */
function mapDataAssociations(el: ModdleElement, ctx: MapContext, originOffset: Position): DiagramEdge[] {
  if (!el.id) return [];
  const edges: DiagramEdge[] = [];

  for (const assoc of (el.dataInputAssociations as ModdleElement[] | undefined) ?? []) {
    const sourceRefs = assoc.sourceRef as ModdleElement[] | undefined;
    const source = sourceRefs?.[0];
    if (!source?.id) continue;
    // targetRef in the raw moddle element is an internal bpmn:Property placeholder, not a real
    // node — the activity itself ("el") is the real semantic target.
    const edge = mapEdge({ ...assoc, sourceRef: source, targetRef: el } as ModdleElement, ctx, 'association', new Set(), originOffset);
    if (edge) edges.push(edge);
  }

  for (const assoc of (el.dataOutputAssociations as ModdleElement[] | undefined) ?? []) {
    const targetRefRaw = assoc.targetRef as ModdleElement | ModdleElement[] | undefined;
    const target = Array.isArray(targetRefRaw) ? targetRefRaw[0] : targetRefRaw;
    if (!target?.id) continue;
    const edge = mapEdge({ ...assoc, sourceRef: el, targetRef: target } as ModdleElement, ctx, 'association', new Set(), originOffset);
    if (edge) edges.push(edge);
  }

  return edges;
}

function mapFlowElementsAndArtifacts(
  flowElements: ModdleElement[],
  artifacts: ModdleElement[],
  ctx: MapContext,
  originOffset: Position = { x: 0, y: 0 },
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const defaultSourceIds = new Set(
    flowElements
      .filter((el) => el.default)
      .map((el) => (el.default as ModdleElement).id!),
  );

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  for (const el of [...flowElements, ...artifacts]) {
    if (el.$type === 'bpmn:SequenceFlow') {
      const edge = mapEdge(el, ctx, 'sequence', defaultSourceIds, originOffset);
      if (edge) { edges.push(edge); recordPreserved(ctx); }
      continue;
    }
    if (el.$type === 'bpmn:Association') {
      const edge = mapEdge(el, ctx, 'association', defaultSourceIds, originOffset);
      if (edge) { edges.push(edge); recordPreserved(ctx); }
      continue;
    }
    const node = mapNode(el, ctx, originOffset);
    if (node) { nodes.push(node); recordPreserved(ctx); }
    else if (!['bpmn:DataObject'].includes(el.$type)) {
      ctx.warnings.push(`Unsupported BPMN element "${el.$type}" (id "${el.id}") has no equivalent in this DSL — skipped`);
      recordLoss(ctx, 'dropped', el.$type, 'BPMN element has no equivalent in .bpm text', el.id);
    }
    edges.push(...mapDataAssociations(el, ctx, originOffset));
  }

  return { nodes, edges };
}

export { checkImportFidelity, type FidelityReport, type FidelityIssue, type FidelityCounts, type FidelityOptions } from './fidelity.js';

export async function importXml(xml: string, options: ImportXmlOptions = {}): Promise<ImportXmlResult> {
  if (typeof xml !== 'string') throw new TypeError('BPMN XML must be a string');
  const xmlBytes = new TextEncoder().encode(xml).byteLength;
  if (xmlBytes > IMPORT_LIMITS.xmlBytes) {
    throw new Error(`BPMN XML exceeds the ${IMPORT_LIMITS.xmlBytes}-byte import limit`);
  }
  scanXmlBudget(xml);
  const warnings: string[] = [];
  const moddle = new BpmnModdle();
  const { rootElement, warnings: moddleWarnings } = await parseWithControls(moddle, xml, options);
  if (options.signal?.aborted) throw cancelledImport();
  for (const w of moddleWarnings) warnings.push(`bpmn-moddle: ${w.message}`);

  const losses: LossAccumulator = { preserved: 0, transformed: 0, dropped: 0, entries: [] };
  const ids = new IdMap(warnings, (rawId, resolvedId) => {
    losses.transformed += 1;
    if (losses.entries.length < MAX_LOSS_ENTRIES) {
      losses.entries.push({
        kind: 'transformed',
        sourceType: 'bpmn:identifier',
        id: rawId,
        message: `Identifier was normalized to "${resolvedId}" for the .bpm grammar`,
      });
    }
  });
  const di = collectDiPositions(rootElement, warnings);
  const ctx: MapContext = { ids, di, warnings, losses };

  const rootElements = (rootElement.rootElements as ModdleElement[] | undefined) ?? [];
  const processes = rootElements.filter((el) => el.$type === 'bpmn:Process');
  const collaboration = rootElements.find((el) => el.$type === 'bpmn:Collaboration');
  const participants = (collaboration?.participants as ModdleElement[] | undefined) ?? [];
  const messageFlows = (collaboration?.messageFlows as ModdleElement[] | undefined) ?? [];

  const pools: Pool[] = [];
  const allNodes: DiagramNode[] = [];
  const allEdges: DiagramEdge[] = [];
  // `via` points are printed in the source node's coordinate frame. Root-process edges are
  // rebased while their process is mapped below; collaboration-level message flows are mapped
  // after all processes, so remember each lane's canvas origin for that later pass as well.
  const sourceFrameOrigins = new Map<string, Position>();

  for (const process of processes) {
    const participant = participants.find((p) => (p.processRef as ModdleElement | undefined)?.id === process.id);
    const flowElements = (process.flowElements as ModdleElement[] | undefined) ?? [];
    const artifacts = (process.artifacts as ModdleElement[] | undefined) ?? [];
    const { nodes, edges } = mapFlowElementsAndArtifacts(flowElements, artifacts, ctx);
    allEdges.push(...edges);

    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    // @bpm/layout-core's waypointMapper (used by both layout-engine-manual and
    // overridePinnedNodes) treats an edge's "via" as being in its SOURCE node's own coordinate
    // frame -- lane-relative when the source is in a lane, same as that node's own "at (x, y)".
    // Group edges by source so the lane loop below can re-base each one the same way it re-bases
    // node positions (found via apps/web/test/e2e/diagram-import-roundtrip.spec.ts against real
    // bpmn-js round-trip data: edges from a lane member kept canvas-absolute via points, which
    // the router then silently mis-routed once it started respecting via at all).
    const edgesBySourceId = new Map<string, DiagramEdge[]>();
    for (const edge of edges) {
      const list = edgesBySourceId.get(edge.sourceId);
      if (list) list.push(edge); else edgesBySourceId.set(edge.sourceId, [edge]);
    }
    const laneSets = (process.laneSets as ModdleElement[] | undefined) ?? [];
    if (participant) {
      const poolId = ids.resolve(process.id, 'pool');
      const poolName = (participant.name as string | undefined) || poolId;
      const lanes: Lane[] = [];
      if (laneSets.length > 0) {
        for (const laneSet of laneSets) {
          for (const laneEl of (laneSet.lanes as ModdleElement[] | undefined) ?? []) {
            const refs = (laneEl.flowNodeRef as ModdleElement[] | undefined) ?? [];
            const nodeIds = refs.map((r) => ids.get(r.id!));
            // A node declared inside a lane has its "at (x, y)" relative to that lane's own
            // top-left (docs/LANGUAGE.md §6.2), but DI bounds are always canvas-absolute — so
            // node positions computed by mapNode() (which knows nothing about lanes) must be
            // re-based here, once lane membership is known.
            const laneOrigin = ctx.di.bounds.get(laneEl.id!);
            if (laneOrigin) {
              for (const nodeId of nodeIds) {
                sourceFrameOrigins.set(nodeId, { x: laneOrigin.x, y: laneOrigin.y });
                const node = nodesById.get(nodeId);
                if (node?.position) {
                  node.position = { x: node.position.x - laneOrigin.x, y: node.position.y - laneOrigin.y };
                }
                for (const edge of edgesBySourceId.get(nodeId) ?? []) {
                  if (edge.waypoints) {
                    edge.waypoints = edge.waypoints.map((p) => ({ x: p.x - laneOrigin.x, y: p.y - laneOrigin.y }));
                  }
                }
              }
            }
            lanes.push({
              id: ids.resolve(laneEl.id, 'lane'),
              name: (laneEl.name as string | undefined) || 'Lane',
              nodeIds,
            });
            recordPreserved(ctx);
          }
        }
      } else if (nodes.length > 0) {
        warnings.push(`Pool "${poolName}" has no lane definitions — synthesizing a single default lane to hold its content`);
        // No real lane DI bounds exist to re-base against, so derive an origin from the content
        // itself (its own bounding-box top-left) — keeps relative spacing correct without it.
        const positioned = nodes.filter((n) => n.position);
        if (positioned.length > 0) {
          const originX = Math.min(...positioned.map((n) => n.position!.x));
          const originY = Math.min(...positioned.map((n) => n.position!.y));
          for (const node of positioned) {
            node.position = { x: node.position!.x - originX, y: node.position!.y - originY };
            sourceFrameOrigins.set(node.id, { x: originX, y: originY });
            for (const edge of edgesBySourceId.get(node.id) ?? []) {
              if (edge.waypoints) {
                edge.waypoints = edge.waypoints.map((p) => ({ x: p.x - originX, y: p.y - originY }));
              }
            }
          }
        }
        lanes.push({ id: ids.resolve(undefined, 'lane'), name: poolName, nodeIds: nodes.map((n) => n.id) });
      }
      pools.push({ id: poolId, name: poolName, lanes });
      recordPreserved(ctx);
    }
    allNodes.push(...nodes);
  }

  for (const mf of messageFlows) {
    const edge = mapEdge(mf, ctx, 'message', new Set(), { x: 0, y: 0 });
    if (edge) {
      // Unlike process flow elements, message flows are stored on the collaboration and are
      // mapped after the lane loop above. Their BPMN DI waypoints are still canvas-absolute, but
      // the DSL/manual router expects the same source-local frame as the source node's `at`.
      const sourceOrigin = sourceFrameOrigins.get(edge.sourceId);
      if (sourceOrigin && edge.waypoints) {
        edge.waypoints = edge.waypoints.map((p) => ({ x: p.x - sourceOrigin.x, y: p.y - sourceOrigin.y }));
      }
      allEdges.push(edge);
      recordPreserved(ctx);
    }
  }

  const diagram: Diagram = {
    pools,
    nodes: allNodes,
    edges: allEdges,
    positioning: 'manual',
  };

  const text = printDiagram(diagram);
  return {
    diagram,
    text,
    warnings,
    lossReport: {
      preserved: losses.preserved,
      transformed: losses.transformed,
      dropped: losses.dropped,
      entries: losses.entries,
    },
  };
}
