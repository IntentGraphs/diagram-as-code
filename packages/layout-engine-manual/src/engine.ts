import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '@bpm/layout-core';
import { facingSides, outlineAnchor, sideOf, createSequentialRouter, assertNoOverlaps, middleRoute, waypointMapper } from '@bpm/layout-core';
import { sizeOf } from '@bpm/layout-elk-base';
import { stackLanes } from './laneStacking.js';

const SUBPROCESS_PADDING = 12;
const SUBPROCESS_HEADER_INSET_Y = 20; // > renderer label baseline at y+14

function isBoundaryEvent(node: DiagramNode): boolean {
  return node.kind === 'event' && node.attachedToId !== undefined;
}

function isExpandedSubprocess(node: DiagramNode): boolean {
  return node.kind === 'activity'
    && !node.collapsed
    && (node.activityType === 'subProcess' || node.activityType === 'transaction')
    && node.children.length > 0;
}

/**
 * `diagramById` is the pre-placement AST node lookup — needed so an explicit `via` (author-space,
 * same frame as the source node's own declared `at (x, y)`) can be delta-mapped into placed/canvas
 * space via `waypointMapper`, the same convention `@bpm/layout-core`'s `overridePinnedNodes` uses.
 * Without this, a manual-positioning diagram's `via` hints were silently ignored entirely — the
 * router always recomputed its own path — found via apps/web/test/e2e/diagram-import-roundtrip.spec.ts
 * and confirmed against real bpmn-js round-trip data.
 */
function routeFlatEdges(
  edges: Diagram['edges'],
  nodeById: Map<string, PositionedNode>,
  diagramById: Map<string, DiagramNode>,
): RoutedEdge[] {
  const router = createSequentialRouter();
  return edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return { ...edge, points: [] };
    const auto = facingSides(source, target);
    const fromSide = edge.from ?? auto.from;
    const toSide = edge.to ?? auto.to;
    const sourceCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const targetCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    // A `from`/`to` that came from the diagram itself (an author's explicit "from left"/"to top",
    // or — for an imported diagram, which is always positioning:'manual' — the side re-derived
    // from the source BPMN's own DI waypoints) is a hard instruction, not a hint: dock at that
    // side's plain bounding-box midpoint (`sideOf`, same convention @bpm/layout-engine-swimlane
    // uses) rather than outlineAnchor's true circle/diamond outline math, which aims at the other
    // endpoint's raw center and silently ignores which side was asked for whenever a `toward`
    // point is given. Left as outlineAnchor's outline-aware diagonal only for the auto-picked
    // fallback, where there's no explicit side to contradict and the angled dock still looks
    // right on a freeform (non-lane) diagram. Without this split, any BPMN pool/lane diagram
    // re-imported and re-exported ("diagram to text") visibly kinked at every event/gateway
    // endpoint that its original swimlane-engine layout had routed around a bend — the edges no
    // longer matched what the same diagram looked like straight out of the editor.
    const start = edge.from ? sideOf(source, fromSide) : outlineAnchor(source, fromSide, sourceCenter);
    const end = edge.to ? sideOf(target, toSide) : outlineAnchor(target, toSide, targetCenter);
    const obstacles = [...nodeById.values()].filter((n) => n.id !== source.id && n.id !== target.id);
    const middle = middleRoute(
      edge, start, end, obstacles, router,
      waypointMapper(diagramById.get(edge.sourceId), source),
    );
    return { ...edge, points: [start, ...middle, end] };
  });
}

function placeSubprocessContents(node: DiagramNode, originX: number, originY: number): PositionedNode {
  if (node.kind !== 'activity') {
    throw new Error(`placeSubprocessContents called on non-activity node "${node.id}"`);
  }
  const contentOriginX = originX + SUBPROCESS_PADDING;
  const contentOriginY = originY + SUBPROCESS_HEADER_INSET_Y;
  // Boundary events stay for positionBoundaryEvents; do not placeNode them here.
  const placeableChildren = node.children.filter((c) => !isBoundaryEvent(c));
  const placedChildren = placeableChildren.map((child) => placeNode(child, contentOriginX, contentOriginY));
  assertNoOverlaps(placedChildren);

  const maxRight = placedChildren.length > 0 ? Math.max(...placedChildren.map((c) => c.x + c.width)) : originX + 100;
  const maxBottom = placedChildren.length > 0 ? Math.max(...placedChildren.map((c) => c.y + c.height)) : originY + 60;
  const width = maxRight - originX + SUBPROCESS_PADDING;
  const height = maxBottom - originY + SUBPROCESS_PADDING;

  const nodeById = new Map(placedChildren.map((c) => [c.id, c]));
  const diagramById = new Map(placeableChildren.map((c) => [c.id, c]));
  const placeableIds = new Set(placeableChildren.map((c) => c.id));
  const routableEdges = node.childEdges.filter(
    (e) => placeableIds.has(e.sourceId) && placeableIds.has(e.targetId),
  );
  const childEdges = routeFlatEdges(routableEdges, nodeById, diagramById);

  const { children: _c, childEdges: _e, ...rest } = node;
  return {
    ...rest, x: originX, y: originY, width, height,
    children: placedChildren, childEdges,
  } as PositionedNode;
}

/** Places one node (and validates it) at `originX/originY + node.position`. No pool/lane context. */
export function placeNode(node: DiagramNode, originX: number, originY: number): PositionedNode {
  if (isBoundaryEvent(node)) {
    throw new Error(`Boundary event "${node.id}" cannot be manually positioned — it is always placed relative to its host.`);
  }
  if (!node.position) {
    throw new Error(`Node "${node.id}" has no position — every node needs "at (x, y)" in a manual-positioning diagram.`);
  }
  if (isExpandedSubprocess(node)) {
    return placeSubprocessContents(node, originX + node.position.x, originY + node.position.y);
  }
  const { width, height } = sizeOf(node);
  if (node.kind === 'activity') {
    const { children: _c, childEdges: _e, ...rest } = node;
    return { ...rest, x: originX + node.position.x, y: originY + node.position.y, width, height } as PositionedNode;
  }
  return { ...node, x: originX + node.position.x, y: originY + node.position.y, width, height } as PositionedNode;
}

export async function layoutManual(diagram: Diagram): Promise<PositionedDiagram> {
  const laneNodeIds = new Set(diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds)));
  const unassigned = diagram.nodes.filter((n) => !laneNodeIds.has(n.id) && !isBoundaryEvent(n));
  const placedLoose = unassigned.map((n) => placeNode(n, 0, 0));

  const stackedPools = stackLanes(diagram, placeNode);
  const placedPooled = stackedPools.flatMap((p) => p.placedNodes);

  const allPlaced = [...placedLoose, ...placedPooled];
  assertNoOverlaps(allPlaced);

  const nodeById = new Map(allPlaced.map((n) => [n.id, n]));
  const diagramById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const edges = routeFlatEdges(diagram.edges, nodeById, diagramById);

  return {
    pools: stackedPools.map((p) => p.positionedPool),
    nodes: allPlaced,
    edges,
  };
}
