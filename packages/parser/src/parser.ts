import type { Diagram, DiagramNode, DiagramEdge, ActivityType, ActivityNode, Pool, Lane, LayoutSpacing, RoutingMode, DiagramDirection, LaneDirection, PaginationMode, PageBreakStrategy, ShapeSizeGroup, ShapeSizes, DiagramSourceMap, SourceLocation } from '@bpm/ast';
import type { ParseError } from './errors.js';
import { checkBpmnLegality } from './bpmnLegality.js';
import { isEventCategory, isEventTrigger, isGatewayType, isValidId, EDGE_ARROW_TO_FLOW_TYPE } from './tokens.js';
import { parseEdgeAttrs, type EdgeAttrs } from './edgeAttrs.js';
import { SIZE_SUFFIX, NODE_ATTRS_SUFFIX, parseNodeAttrs, parseSizeHint } from './nodeSuffixes.js';

const EVENT_LINE = /^event\s+(\S+)\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const BOUNDARY_LINE = /^boundary\s+(\S+)\s+(interrupting|nonInterrupting)\s+"([^"]*)"\s+as\s+(\S+)\s+on\s+(\S+)$/;
const GATEWAY_LINE = /^gateway\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const ACTIVITY_LINE = /^(task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subprocess|transaction|callActivity)\s+"([^"]*)"\s+as\s+(\S+)(\s+collapsed)?$/;
const DATA_LINE = /^(dataObject|dataStore|annotation|group)\s+"([^"]*)"\s+as\s+(\S+)$/;
const LAYOUT_DIRECTIVE_LINE = /^layout:\s*(\S+)$/;
const POSITIONING_DIRECTIVE_LINE = /^positioning:\s*(\S+)$/;
const LAYOUT_SPACING_DIRECTIVE_LINE = /^layoutSpacing:\s*(\S+)$/;
const SHAPE_SIZE_DIRECTIVE_LINE = /^shapeSize:\s*(\S+)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/;
const ROUTING_DIRECTIVE_LINE = /^routing:\s*(\S+)$/;
const DIRECTION_DIRECTIVE_LINE = /^direction:\s*(\S+)$/;
const LANE_DIRECTION_DIRECTIVE_LINE = /^laneDirection:\s*(\S+)$/;
const PAGINATE_DIRECTIVE_LINE = /^paginate:\s*(\S+)$/;
const PAGE_BREAK_DIRECTIVE_LINE = /^pageBreak:\s*(\S+)$/;
const POSITION_SUFFIX = /\s+at\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/;
const EDGE_ATTRS_SUFFIX = /\s*\[([^\]]*)\]\s*$/;
const POOL_LINE = /^pool\s+"([^"]*)"(.*)$/;
const LANE_LINE = /^lane\s+"([^"]*)"(.*)$/;
const EDGE_LINE = /^(\S+)\s*(->>|->|=>|~>|\.\.>)\s*(\S+)(?:\s*:\s*"?([^"]*?)"?)?$/;

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  task: 'task',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  sendTask: 'sendTask',
  receiveTask: 'receiveTask',
  manualTask: 'manualTask',
  businessRuleTask: 'businessRuleTask',
  scriptTask: 'scriptTask',
  subprocess: 'subProcess',
  transaction: 'transaction',
  callActivity: 'callActivity',
};
const DATA_KIND_MAP: Record<string, DiagramNode['kind']> = {
  dataObject: 'dataObject', dataStore: 'dataStore', annotation: 'textAnnotation', group: 'group',
};
const NESTABLE_ACTIVITY_TYPES: ActivityType[] = ['subProcess', 'transaction'];
const LAYOUT_SPACINGS: LayoutSpacing[] = ['compact', 'normal', 'relaxed', 'spacious'];
const ROUTING_MODES: RoutingMode[] = ['quality', 'hybrid', 'fast'];
const DIRECTIONS: DiagramDirection[] = ['right', 'left', 'down', 'up'];
const LANE_DIRECTIONS: LaneDirection[] = ['horizontal', 'vertical'];
const SHAPE_SIZE_GROUPS: ShapeSizeGroup[] = ['all', 'event', 'task', 'gateway', 'data', 'annotation', 'group'];

function isLayoutSpacing(value: string): value is LayoutSpacing {
  return (LAYOUT_SPACINGS as string[]).includes(value);
}
function isRoutingMode(value: string): value is RoutingMode { return ROUTING_MODES.includes(value as RoutingMode); }
function isDirection(value: string): value is DiagramDirection { return DIRECTIONS.includes(value as DiagramDirection); }
function isLaneDirection(value: string): value is LaneDirection { return LANE_DIRECTIONS.includes(value as LaneDirection); }
function isPaginationMode(value: string): value is PaginationMode { return ['none', 'semantic', 'tile', 'hybrid'].includes(value); }
function isPageBreakStrategy(value: string): value is PageBreakStrategy { return ['pool', 'lane', 'group', 'branch'].includes(value); }
function isShapeSizeGroup(value: string): value is ShapeSizeGroup { return SHAPE_SIZE_GROUPS.includes(value as ShapeSizeGroup); }

interface FrameSuffix {
  position?: { x: number; y: number };
  sizeHint?: { width: number; height: number };
}

function parseFrameSuffix(raw: string, lineNumber: number, errors: ParseError[]): FrameSuffix | null {
  if (raw.trim() === '') return {};
  const match = raw.match(/^\s*at\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s+size\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
  if (!match) {
    errors.push({ line: lineNumber, column: 1, message: 'Malformed pool/lane frame; expected at (x, y) size (w, h)' });
    return null;
  }
  const sizeHint = parseSizeHint(match[3], match[4], lineNumber, errors);
  if (!sizeHint) return null;
  return {
    position: { x: Number(match[1]), y: Number(match[2]) },
    sizeHint,
  };
}

export interface ParseResult {
  diagram: Diagram;
  /** Syntactic / grammar errors — diagram may be partial or empty. */
  errors: ParseError[];
  /** BPMN 2.0 structural legality violations — only populated when `errors` is empty. */
  semanticErrors: ParseError[];
  /** Semantic-id to source-declaration mapping used by editors and other workspace integrations. */
  sourceLocations: DiagramSourceMap;
}

interface Frame {
  indent: number; // indentation level this frame's children are expected at
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  knownIds: Set<string>;
  // present only for a pool/lane frame:
  pool?: Pool;
  lane?: Lane;
  // present only for a subprocess/transaction frame:
  activity?: ActivityNode;
}

function indentOf(rawLine: string): number {
  const match = rawLine.match(/^ */);
  return match ? match[0].length : 0;
}

export function parse(text: string): ParseResult {
  // Browser textareas normalize line endings, but CLI/IDE callers may provide CRLF or CR-only
  // documents. Normalize once so grammar matching, source columns, and editor offsets agree.
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const errors: ParseError[] = [];
  let edgeCounter = 0;
  let poolCounter = 0;
  let laneCounter = 0;
  let layoutMode: string | undefined;
  let positioningMode: string | undefined;
  let positioningLine = 0;
  let layoutSpacing: LayoutSpacing | undefined;
  let layoutSpacingLine = 0;
  const shapeSizes: ShapeSizes = {};
  let routing: RoutingMode | undefined;
  let direction: DiagramDirection | undefined;
  let laneDirection: LaneDirection | undefined;
  let paginate: PaginationMode | undefined;
  let paginateLine = 0;
  let pageBreak: PageBreakStrategy | undefined;
  let pageBreakLine = 0;
  const pools: Pool[] = [];

  // Leading directive lines (layout:, positioning:, layoutSpacing:, shapeSize:, routing:), any order.
  const firstContentIndex = lines.findIndex((l) => l.trim() !== '');
  let bodyStartIndex = 0;
  if (firstContentIndex !== -1) {
    let cursor = firstContentIndex;
    while (cursor < lines.length) {
      const trimmed = lines[cursor].trim();
      // Shared header directives such as `render:` are removed by the runtime before this
      // family parser runs. Keep allowing blank lines here so a directive block remains
      // contiguous after that normalization (and so blank lines between directives are safe).
      if (trimmed === '') {
        cursor += 1;
        continue;
      }
      const layoutDirectiveMatch = trimmed.match(LAYOUT_DIRECTIVE_LINE);
      if (layoutDirectiveMatch) {
        layoutMode = layoutDirectiveMatch[1];
        cursor += 1;
        continue;
      }
      const positioningDirectiveMatch = trimmed.match(POSITIONING_DIRECTIVE_LINE);
      if (positioningDirectiveMatch) {
        positioningMode = positioningDirectiveMatch[1];
        positioningLine = cursor + 1;
        cursor += 1;
        continue;
      }
      const spacingDirectiveMatch = trimmed.match(LAYOUT_SPACING_DIRECTIVE_LINE);
      if (spacingDirectiveMatch) {
        const value = spacingDirectiveMatch[1];
        layoutSpacingLine = cursor + 1;
        if (!isLayoutSpacing(value)) {
          errors.push({ line: layoutSpacingLine, column: 1, message: `Unknown layoutSpacing "${value}"` });
        } else {
          layoutSpacing = value;
        }
        cursor += 1;
        continue;
      }
      const shapeSizeDirectiveMatch = trimmed.match(SHAPE_SIZE_DIRECTIVE_LINE);
      if (shapeSizeDirectiveMatch) {
        const group = shapeSizeDirectiveMatch[1];
        const hint = parseSizeHint(shapeSizeDirectiveMatch[2], shapeSizeDirectiveMatch[3], cursor + 1, errors);
        if (hint && isShapeSizeGroup(group)) shapeSizes[group] = hint;
        else if (hint) errors.push({ line: cursor + 1, column: 1, message: `Unknown shapeSize group "${group}" (expected all, event, task, gateway, data, annotation, or group)` });
        cursor += 1;
        continue;
      }
      if (trimmed.startsWith('shapeSize:')) {
        errors.push({ line: cursor + 1, column: 1, message: 'Malformed shapeSize directive; expected "shapeSize: <group> (w, h)"' });
        cursor += 1;
        continue;
      }
      const routingDirectiveMatch = trimmed.match(ROUTING_DIRECTIVE_LINE);
      if (routingDirectiveMatch) {
        const value = routingDirectiveMatch[1].toLowerCase();
        if (!isRoutingMode(value)) errors.push({ line: cursor + 1, column: 1, message: `Unknown routing mode "${routingDirectiveMatch[1]}" (expected quality, hybrid, or fast)`, code: 'invalid_routing' });
        else routing = value;
        cursor += 1;
        continue;
      }
      const directionMatch = trimmed.match(DIRECTION_DIRECTIVE_LINE);
      if (directionMatch) {
        const value = directionMatch[1];
        if (!isDirection(value)) errors.push({ line: cursor + 1, column: 1, message: `Unknown direction "${value}" (expected right, left, down, or up)`, code: 'invalid_direction' });
        else direction = value;
        cursor += 1;
        continue;
      }
      const laneDirectionMatch = trimmed.match(LANE_DIRECTION_DIRECTIVE_LINE);
      if (laneDirectionMatch) {
        const value = laneDirectionMatch[1];
        if (!isLaneDirection(value)) errors.push({ line: cursor + 1, column: 1, message: `Unknown laneDirection "${value}" (expected horizontal or vertical)`, code: 'invalid_lane_direction' });
        else laneDirection = value;
        cursor += 1;
        continue;
      }
      const paginateMatch = trimmed.match(PAGINATE_DIRECTIVE_LINE);
      if (paginateMatch) {
        const value = paginateMatch[1].toLowerCase();
        paginateLine = cursor + 1;
        if (!isPaginationMode(value)) errors.push({ line: cursor + 1, column: 1, message: `Unknown pagination mode "${paginateMatch[1]}" (expected none, semantic, tile, or hybrid)`, code: 'malformed_paginate' });
        else if (paginate !== undefined) errors.push({ line: cursor + 1, column: 1, message: 'Only one paginate directive is allowed', code: 'duplicate_paginate' });
        else paginate = value;
        cursor += 1;
        continue;
      }
      const pageBreakMatch = trimmed.match(PAGE_BREAK_DIRECTIVE_LINE);
      if (pageBreakMatch) {
        const value = pageBreakMatch[1].toLowerCase();
        pageBreakLine = cursor + 1;
        if (!isPageBreakStrategy(value)) errors.push({ line: cursor + 1, column: 1, message: `Unknown pageBreak strategy "${pageBreakMatch[1]}" (expected pool, lane, group, or branch)`, code: 'malformed_page_break' });
        else if (pageBreak !== undefined) errors.push({ line: cursor + 1, column: 1, message: 'Only one pageBreak directive is allowed', code: 'duplicate_page_break' });
        else pageBreak = value;
        cursor += 1;
        continue;
      }
      break;
    }
    bodyStartIndex = cursor;
  }

  if (positioningMode !== undefined && positioningMode !== 'manual') {
    errors.push({ line: positioningLine, column: 1, message: `Unknown positioning mode "${positioningMode}"` });
  }
  if (layoutMode !== undefined && positioningMode === 'manual') {
    errors.push({
      line: positioningLine, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  }
  if (paginate === 'tile' || paginate === 'hybrid') errors.push({ line: paginateLine, column: 1, message: `Pagination mode "${paginate}" is not supported; use paginate: semantic`, code: 'unsupported_pagination_combination' });
  if (pageBreak === 'group' || pageBreak === 'branch') errors.push({ line: pageBreakLine, column: 1, message: `pageBreak: ${pageBreak} is not supported; use pageBreak: pool or pageBreak: lane`, code: 'unsupported_pagination_combination' });
  if (pageBreak && (!paginate || paginate === 'none' || paginate === 'tile')) errors.push({ line: pageBreakLine, column: 1, message: `pageBreak: ${pageBreak} requires paginate: semantic`, code: 'unsupported_pagination_combination' });

  const root: Frame = { indent: 0, nodes: [], edges: [], knownIds: new Set() };
  const stack: Frame[] = [root];
  const allKnownIds = new Set<string>(); // global id-uniqueness across the whole diagram, for edges/boundary targets
  const allNodesById = new Map<string, DiagramNode>();
  const nodeSourceLines = new Map<string, number>();
  const edgeSourceLines = new Map<string, number>();
  const poolSourceLines = new Map<string, number>();
  const laneSourceLines = new Map<string, number>();

  function currentFrame(): Frame {
    return stack[stack.length - 1];
  }

  lines.forEach((rawLine, index) => {
    if (index < bodyStartIndex) return;
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') return;
    const indent = indentOf(rawLine);

    // Close any frames we've dedented out of.
    while (stack.length > 1 && indent < currentFrame().indent) {
      const finished = stack.pop()!;
      if (finished.activity) {
        finished.activity.children = finished.nodes;
        finished.activity.childEdges = finished.edges;
      }
    }

    const frame = currentFrame();
    const expectedChildIndent = frame.indent + 2;

    const poolMatch = line.match(POOL_LINE);
    if (poolMatch && indent === 0) {
      const frameGeometry = parseFrameSuffix(poolMatch[2], lineNumber, errors);
      if (frameGeometry === null) return;
      poolCounter += 1;
      const pool: Pool = { id: `pool${poolCounter}`, name: poolMatch[1], lanes: [], ...frameGeometry };
      pools.push(pool);
      poolSourceLines.set(pool.id, lineNumber);
      stack.push({ indent: expectedChildIndent, nodes: root.nodes, edges: root.edges, knownIds: root.knownIds, pool });
      return;
    }

    const laneMatch = line.match(LANE_LINE);
    if (laneMatch && frame.pool && indent === frame.indent) {
      const frameGeometry = parseFrameSuffix(laneMatch[2], lineNumber, errors);
      if (frameGeometry === null) return;
      laneCounter += 1;
      const lane: Lane = { id: `lane${laneCounter}`, name: laneMatch[1], nodeIds: [], ...frameGeometry };
      frame.pool.lanes.push(lane);
      laneSourceLines.set(lane.id, lineNumber);
      stack.push({ indent: expectedChildIndent, nodes: root.nodes, edges: root.edges, knownIds: root.knownIds, lane });
      return;
    }

    if (indent > frame.indent && !frame.pool && !frame.lane && !frame.activity && frame !== root) {
      // unreachable in practice; guards against malformed indentation under a non-container frame
    }

    let bodyLine = line;
    let position: { x: number; y: number } | undefined;
    let sizeHint: { width: number; height: number } | undefined;
    let visual: import('@bpm/ast').NodeVisual | undefined;
    let camunda: import('@bpm/ast').CamundaExtensions | undefined;
    let eventDefinition: import('@bpm/ast').EventDefinition | undefined;

    let edgeAttrsRaw: string | undefined;
    // Edge attrs must be stripped before node size/visual so `a -> b [via: ...]` stays an edge.
    const edgeAttrsMatch = bodyLine.match(EDGE_ATTRS_SUFFIX);
    const looksLikeEdge = /->>|->|=>|~>|\.\.>/.test(bodyLine);
    if (edgeAttrsMatch && looksLikeEdge) {
      edgeAttrsRaw = edgeAttrsMatch[1];
      bodyLine = bodyLine.slice(0, edgeAttrsMatch.index).trimEnd();
    } else {
      const nodeAttrsMatch = bodyLine.match(NODE_ATTRS_SUFFIX);
      if (nodeAttrsMatch && !looksLikeEdge) {
        const parsedAttrs = parseNodeAttrs(nodeAttrsMatch[1], lineNumber, errors);
        if (parsedAttrs === null) return;
        visual = parsedAttrs.visual;
        camunda = parsedAttrs.camunda;
        eventDefinition = parsedAttrs.eventDefinition;
        bodyLine = bodyLine.slice(0, nodeAttrsMatch.index).trimEnd();
      }
    }

    const sizeSuffixMatch = bodyLine.match(SIZE_SUFFIX);
    if (sizeSuffixMatch && !looksLikeEdge) {
      const hint = parseSizeHint(sizeSuffixMatch[1], sizeSuffixMatch[2], lineNumber, errors);
      if (hint === null) return;
      sizeHint = hint;
      bodyLine = bodyLine.slice(0, sizeSuffixMatch.index).trimEnd();
    }

    const positionSuffixMatch = bodyLine.match(POSITION_SUFFIX);
    if (positionSuffixMatch) {
      position = { x: Number(positionSuffixMatch[1]), y: Number(positionSuffixMatch[2]) };
      bodyLine = bodyLine.slice(0, positionSuffixMatch.index).trimEnd();
    }

    const extras = {
      ...(position ? { position } : {}),
      ...(sizeHint ? { sizeHint } : {}),
      ...(visual ? { visual } : {}),
      ...(eventDefinition ? { eventDefinition } : {}),
    };

    function rejectCamundaIfPresent(kindLabel: string): boolean {
      if (!camunda) return false;
      errors.push({
        line: lineNumber,
        column: 1,
        message: `Camunda attributes are only valid on serviceTask (camundaClass, camundaExpression) or userTask (camundaFormKey) — not on ${kindLabel}`,
      });
      return true;
    }

    const eventMatch = bodyLine.match(EVENT_LINE);
    const boundaryMatch = bodyLine.match(BOUNDARY_LINE);
    const gatewayMatch = bodyLine.match(GATEWAY_LINE);
    const activityMatch = bodyLine.match(ACTIVITY_LINE);
    const dataMatch = bodyLine.match(DATA_LINE);
    const edgeMatch = !eventMatch && !boundaryMatch && !gatewayMatch && !activityMatch && !dataMatch
      ? bodyLine.match(EDGE_LINE) : null;

    function requireValidId(id: string, role = 'id'): boolean {
      if (isValidId(id)) return true;
      errors.push({
        line: lineNumber, column: 1,
        message: `Invalid ${role} "${id}" — identifiers must match [A-Za-z_][A-Za-z0-9_.-]*`,
      });
      return false;
    }

    function addNode(node: DiagramNode) {
      if (allKnownIds.has(node.id)) {
        errors.push({
          line: lineNumber,
          column: 1,
          message: `Identifier "${node.id}" is already declared — every node id must be unique`,
          code: 'duplicate_id',
        });
        return;
      }
      if (frame.lane) frame.lane.nodeIds.push(node.id);
      frame.nodes.push(node);
      frame.knownIds.add(node.id);
      allKnownIds.add(node.id);
      allNodesById.set(node.id, node);
      nodeSourceLines.set(node.id, lineNumber);
    }

    function checkPosition(id: string): boolean {
      if (positioningMode === 'manual' && !position) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Node "${id}" is missing a required position ("at (x, y)") in a manual-positioning diagram`,
        });
        return false;
      }
      return true;
    }

    if (eventMatch) {
      const [, category, trigger, label, id] = eventMatch;
      if (!isEventCategory(category)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event category "${category}"` });
        return;
      }
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!requireValidId(id)) return;
      if (!checkPosition(id)) return;
      if (rejectCamundaIfPresent('an event')) return;
      addNode({ kind: 'event', id, label, category, trigger, interrupting: true, ...extras });
      return;
    }

    if (boundaryMatch) {
      const [, trigger, interrupting, label, id, attachedToId] = boundaryMatch;
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!requireValidId(id)) return;
      if (!requireValidId(attachedToId, 'host id')) return;
      if (!allKnownIds.has(attachedToId)) {
        errors.push({ line: lineNumber, column: 1, message: `Boundary event references unknown activity id "${attachedToId}"` });
        return;
      }
      if (position) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Boundary event "${id}" cannot have a position — it is always placed relative to its host "${attachedToId}"`,
        });
        return;
      }
      if (sizeHint || visual || camunda) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Boundary event "${id}" cannot have size or label visual attributes`,
        });
        return;
      }
      addNode({ kind: 'event', id, label, category: 'intermediate', trigger, interrupting: interrupting === 'interrupting', attachedToId, ...(eventDefinition ? { eventDefinition } : {}) });
      return;
    }

    if (gatewayMatch) {
      const [, gatewayType, label, id] = gatewayMatch;
      if (!isGatewayType(gatewayType)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown gateway type "${gatewayType}"` });
        return;
      }
      if (!requireValidId(id)) return;
      if (!checkPosition(id)) return;
      if (rejectCamundaIfPresent('a gateway')) return;
      addNode({ kind: 'gateway', id, label, gatewayType, ...extras });
      return;
    }

    if (activityMatch) {
      const [, typeToken, label, id, collapsedToken] = activityMatch;
      const activityType = ACTIVITY_TYPE_MAP[typeToken];
      const collapsed = Boolean(collapsedToken);
      if (!requireValidId(id)) return;
      if (!checkPosition(id)) return;
      if (camunda) {
        if (camunda.formKey && activityType !== 'userTask') {
          errors.push({
            line: lineNumber, column: 1,
            message: `camundaFormKey is only valid on userTask (got ${typeToken})`,
          });
          return;
        }
        if ((camunda.class || camunda.expression) && activityType !== 'serviceTask') {
          errors.push({
            line: lineNumber, column: 1,
            message: `camundaClass / camundaExpression are only valid on serviceTask (got ${typeToken})`,
          });
          return;
        }
      }
      const node: ActivityNode = {
        kind: 'activity', id, label, activityType, collapsed, children: [], childEdges: [],
        ...extras,
        ...(camunda ? { camunda } : {}),
      };
      addNode(node);
      if (NESTABLE_ACTIVITY_TYPES.includes(activityType) && !collapsed) {
        stack.push({ indent: expectedChildIndent, nodes: [], edges: [], knownIds: new Set(), activity: node });
      }
      return;
    }

    if (dataMatch) {
      const [, typeToken, label, id] = dataMatch;
      if (!requireValidId(id)) return;
      if (!checkPosition(id)) return;
      if (rejectCamundaIfPresent('a data/annotation/group node')) return;
      addNode({ kind: DATA_KIND_MAP[typeToken], id, label, ...extras } as DiagramNode);
      return;
    }

    if (edgeMatch) {
      const [, sourceId, arrow, targetId, label] = edgeMatch;
      if (!requireValidId(sourceId, 'edge source id') || !requireValidId(targetId, 'edge target id')) return;
      if (!frame.knownIds.has(sourceId) && !allKnownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!frame.knownIds.has(targetId) && !allKnownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      let attrs: EdgeAttrs = {};
      if (edgeAttrsRaw !== undefined) {
        const parsed = parseEdgeAttrs(edgeAttrsRaw, lineNumber, errors);
        if (parsed === null) return;
        attrs = parsed;
      }
      edgeCounter += 1;
      const edgeId = `e${edgeCounter}`;
      edgeSourceLines.set(edgeId, lineNumber);
      frame.edges.push({
        id: edgeId, sourceId, targetId,
        label: label?.trim() || undefined,
        flowType: EDGE_ARROW_TO_FLOW_TYPE[arrow],
        ...attrs,
      });
      return;
    }

    errors.push({ line: lineNumber, column: 1, message: `Could not parse line: "${line}"` });
  });

  // Close any still-open frames at end of input.
  while (stack.length > 1) {
    const finished = stack.pop()!;
    if (finished.activity) {
      finished.activity.children = finished.nodes;
      finished.activity.childEdges = finished.edges;
    }
  }

  const diagram: Diagram = {
    pools, nodes: root.nodes, edges: root.edges,
    layout: layoutMode,
    positioning: positioningMode === 'manual' ? 'manual' : undefined,
    ...(layoutSpacing ? { layoutSpacing } : {}),
    ...(Object.keys(shapeSizes).length > 0 ? { shapeSizes } : {}),
    ...(routing ? { routing } : {}),
    ...(direction ? { direction } : {}),
    ...(laneDirection ? { laneDirection } : {}),
    ...(paginate ? { paginate } : {}),
    ...(pageBreak ? { pageBreak } : {}),
  };

  const semanticErrors = errors.length === 0
    ? checkBpmnLegality(diagram, { nodeSourceLines, edgeSourceLines })
    : [];

  const sourceLocation = (line: number): SourceLocation => ({
    line,
    startColumn: 1,
    endColumn: (lines[line - 1]?.length ?? 0) + 1,
  });
  const locations = (entries: Map<string, number>): Record<string, SourceLocation> => Object.fromEntries(
    [...entries].map(([id, line]) => [id, sourceLocation(line)]),
  );

  return {
    diagram,
    errors,
    semanticErrors,
    sourceLocations: {
      nodes: locations(nodeSourceLines),
      edges: locations(edgeSourceLines),
      pools: locations(poolSourceLines),
      lanes: locations(laneSourceLines),
    },
  };
}
