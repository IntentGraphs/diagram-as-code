import {
  isBoundaryEvent as isAstBoundaryEvent,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type EventNode,
  type Side,
} from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from './types.js';
import { createSequentialRouter } from '@bpm/diagram-core';
import { sideOf, stubFrom } from './anchors.js';

const TARGET_ENTRY_STUB = 14;

const BOUNDARY_EVENT_SIZE = { width: 36, height: 36 };

/** Key used for the diagram-level scope, which has no containing activity. */
const ROOT_SCOPE = '\u0000root';

interface Scope {
  /** Id of the containing activity, or ROOT_SCOPE for the diagram itself. */
  containerId: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

function isBoundaryEvent(node: DiagramNode): node is EventNode & { attachedToId: string } {
  return isAstBoundaryEvent(node) && node.attachedToId !== undefined;
}

/** Every level of the diagram tree that can declare its own nodes and edges. */
function collectScopes(nodes: DiagramNode[], edges: DiagramEdge[], containerId: string, into: Scope[]): Scope[] {
  into.push({ containerId, nodes, edges });
  for (const node of nodes) {
    if (node.kind === 'activity' && node.children.length > 0) {
      collectScopes(node.children, node.childEdges, node.id, into);
    }
  }
  return into;
}

function findPositionedIn(nodes: PositionedNode[], id: string): PositionedNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findPositionedIn(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findPositioned(positioned: PositionedDiagram, id: string): PositionedNode | undefined {
  return findPositionedIn(positioned.nodes, id);
}

function flattenPositioned(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flattenPositioned(node.children, into);
  }
  return into;
}

function leftBorder(node: PositionedNode): { x: number; y: number } {
  return { x: node.x, y: node.y + node.height / 2 };
}

function rightBorder(node: PositionedNode): { x: number; y: number } {
  return { x: node.x + node.width, y: node.y + node.height / 2 };
}

function bottomBorder(node: PositionedNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height };
}

/** Enter the target via whichever border (left or right) faces the incoming edge. */
function sweepEntrySide(start: { x: number; y: number }, target: PositionedNode): Side {
  return target.x + target.width / 2 < start.x ? 'left' : 'right';
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

export function positionBoundaryEvents(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const scopes = collectScopes(diagram.nodes, diagram.edges, ROOT_SCOPE, []);

  const addedNodes = new Map<string, PositionedNode[]>();
  const addedEdges = new Map<string, RoutedEdge[]>();
  const boundaryPositionById = new Map<string, PositionedNode>();

  for (const scope of scopes) {
    const byHost = new Map<string, Array<EventNode & { attachedToId: string }>>();
    for (const node of scope.nodes) {
      if (isBoundaryEvent(node)) push(byHost, node.attachedToId, node);
    }

    for (const [hostId, events] of byHost) {
      const host = findPositioned(positioned, hostId);
      if (!host) continue;
      // Evenly spread events across the host's width when they fit; once there are enough
      // of them that even spacing would overlap the (fixed-size) circles, fall back to a
      // fixed minimum spacing and let the row extend past the host's edges instead of
      // letting the circles overlap each other.
      const evenSpacing = host.width / (events.length + 1);
      const minSpacing = BOUNDARY_EVENT_SIZE.width + 8;
      const spacing = Math.max(evenSpacing, minSpacing);
      const rowWidth = spacing * (events.length - 1);
      const rowStartX = host.x + host.width / 2 - rowWidth / 2;
      events.forEach((event, index) => {
        const centerX = events.length === 1 ? host.x + evenSpacing : rowStartX + spacing * index;
        const positionedEvent: PositionedNode = {
          ...event,
          x: centerX - BOUNDARY_EVENT_SIZE.width / 2,
          y: host.y + host.height - BOUNDARY_EVENT_SIZE.height / 2,
          width: BOUNDARY_EVENT_SIZE.width,
          height: BOUNDARY_EVENT_SIZE.height,
        };
        push(addedNodes, scope.containerId, positionedEvent);
        boundaryPositionById.set(event.id, positionedEvent);
      });
    }
  }

  if (boundaryPositionById.size === 0) return positioned;

  // toElkGraph drops every edge touching a boundary event, so both directions are re-routed here.
  const resolve = (id: string): PositionedNode | undefined =>
    boundaryPositionById.get(id) ?? findPositioned(positioned, id);

  const allNodes = flattenPositioned(positioned.nodes);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));

  // Routing "around everything" is fine for a small diagram, but in a large multi-pool one it
  // means a short local hop (e.g. a boundary event to a task two nodes away in the same lane)
  // detours around every other pool's content too — a much longer, more crossing-prone path
  // than necessary. Scope the obstacle set to the boundary event's own pool when it has one,
  // so the detour stays proportional to the area it actually needs to clear.
  const poolObstaclesByNodeId = new Map<string, PositionedNode[]>();
  for (const pool of diagram.pools) {
    const poolNodes = pool.lanes
      .flatMap((lane) => lane.nodeIds)
      .map((id) => nodeById.get(id))
      .filter((n): n is PositionedNode => Boolean(n));
    for (const id of pool.lanes.flatMap((lane) => lane.nodeIds)) {
      poolObstaclesByNodeId.set(id, poolNodes);
    }
  }

  // Same proportionality reasoning as poolObstaclesByNodeId, but for hosts that aren't in a
  // pool: a boundary event routing to a sibling inside the same subprocess must never treat
  // the subprocess container itself as an obstacle — the container encloses both endpoints,
  // so any path between them is structurally "trapped" inside it. Scope those obstacles to
  // the host's own scope siblings instead of every node in the diagram.
  const scopeObstaclesByContainerId = new Map<string, PositionedNode[]>();
  for (const scope of scopes) {
    const scopeNodes = scope.nodes
      .map((n) => nodeById.get(n.id))
      .filter((n): n is PositionedNode => Boolean(n));
    scopeObstaclesByContainerId.set(scope.containerId, scopeNodes);
  }

  // Collect every boundary-originated edge first, then route them all through one shared
  // sequential router below — each edge treats every previously-routed edge as an obstacle,
  // which keeps their corridors from overlapping without any hand-assigned lane scheme.
  const boundaryRoutes: Array<{
    scope: Scope;
    edge: DiagramEdge;
    start: { x: number; y: number };
    target: PositionedNode;
    obstacles: PositionedNode[];
    hostId: string | undefined;
  }> = [];
  for (const scope of scopes) {
    for (const edge of scope.edges) {
      const sourceIsBoundary = boundaryPositionById.has(edge.sourceId);
      const targetIsBoundary = boundaryPositionById.has(edge.targetId);
      if (!sourceIsBoundary && !targetIsBoundary) continue;

      const source = resolve(edge.sourceId);
      const target = resolve(edge.targetId);
      // An endpoint with no position (e.g. inside a collapsed activity) has nothing to route to.
      if (!source || !target) continue;

      if (!sourceIsBoundary) {
        push(addedEdges, scope.containerId, { ...edge, points: [rightBorder(source), leftBorder(target)] });
        continue;
      }
      const hostId = (source as unknown as { attachedToId?: string }).attachedToId;
      const baseObstacles = (hostId ? poolObstaclesByNodeId.get(hostId) : undefined)
        ?? scopeObstaclesByContainerId.get(scope.containerId)
        ?? allNodes;
      // baseObstacles is built from the pre-boundary-event `positioned` snapshot, so sibling
      // boundary events sharing this same host (e.g. three timeout/error/escalation circles
      // crowded along one activity's border) are never in it — add them separately, or a route
      // computed after this one can plot straight through a sibling's circle (verified in dev
      // against the crowdedBoundary fixture — see Task 3's notes).
      const siblingBoundaries = [...boundaryPositionById.values()].filter(
        (n) => n.id !== edge.sourceId && (n as unknown as { attachedToId?: string }).attachedToId === hostId,
      );
      const obstacles = [...baseObstacles, ...siblingBoundaries];
      boundaryRoutes.push({ scope, edge, start: bottomBorder(source), target, obstacles, hostId });
    }
  }

  const router = createSequentialRouter();

  for (const route of boundaryRoutes) {
    // Unlike the old exclude-the-target-entirely approach, the target IS kept as a real
    // obstacle here: the router is only routed as far as a short stub just outside the
    // target's entry border, and the final short perpendicular hop from that stub to the
    // border itself is appended by hand afterward — the same pattern
    // packages/layout-engine-swimlane's laneBanding.ts already uses for its own cross-lane
    // edges. Excluding the target outright let the shortest-path search cut straight through
    // its interior whenever the picked entry side didn't match the direction the path was
    // actually approaching from.
    const targetSide: Side = route.edge.to ?? sweepEntrySide(route.start, route.target);
    const entryPoint = sideOf(route.target, targetSide);
    const entryStub = stubFrom(entryPoint, targetSide, TARGET_ENTRY_STUB);
    const points = [...router.route(route.start, entryStub, route.obstacles), entryPoint];
    push(addedEdges, route.scope.containerId, { ...route.edge, points });
  }

  const applyAdditions = (node: PositionedNode): PositionedNode => {
    const extraNodes = addedNodes.get(node.id);
    const extraEdges = addedEdges.get(node.id);
    if (!node.children && !extraNodes && !extraEdges) return node;
    return {
      ...node,
      children: [...(node.children ?? []).map(applyAdditions), ...(extraNodes ?? [])],
      childEdges: [...(node.childEdges ?? []), ...(extraEdges ?? [])],
    } as PositionedNode;
  };

  return {
    pools: positioned.pools,
    nodes: [...positioned.nodes.map(applyAdditions), ...(addedNodes.get(ROOT_SCOPE) ?? [])],
    edges: [...positioned.edges, ...(addedEdges.get(ROOT_SCOPE) ?? [])],
  };
}
