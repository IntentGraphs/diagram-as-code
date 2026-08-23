import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from './types.js';
import { facingSides, sideOf } from './anchors.js';
import { createSequentialRouter } from '@bpm/diagram-core';
import { middleRoute, waypointMapper } from './routing/middleRoute.js';
import { assertNoOverlaps } from './overlap.js';


function resolvePinnedOrigin(diagram: Diagram, positioned: PositionedDiagram, nodeId: string): { x: number; y: number } {
  for (const pool of positioned.pools) {
    const diagramPool = diagram.pools.find((p) => p.id === pool.id);
    if (!diagramPool) continue;
    for (const lane of pool.lanes) {
      const diagramLane = diagramPool.lanes.find((l) => l.id === lane.id);
      if (diagramLane?.nodeIds.includes(nodeId)) return { x: lane.x, y: lane.y };
    }
  }
  return { x: 0, y: 0 };
}

/** Override auto-laid-out positions for nodes that carried `at (x, y)` without `positioning: manual`. */
export function overridePinnedNodes(diagram: Diagram, autoPositioned: PositionedDiagram): PositionedDiagram {
  const pinnedIds = new Set(diagram.nodes.filter((n) => n.position).map((n) => n.id));
  if (pinnedIds.size === 0) return autoPositioned;

  const diagramById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const overriddenNodes = autoPositioned.nodes.map((n) => {
    if (!pinnedIds.has(n.id)) return n;
    const origin = resolvePinnedOrigin(diagram, autoPositioned, n.id);
    const position = diagramById.get(n.id)!.position!;
    const sizeHint = diagramById.get(n.id)!.sizeHint;
    const sized = sizeHint
      ? { ...n, width: Math.max(n.width, sizeHint.width), height: Math.max(n.height, sizeHint.height) }
      : n;
    return { ...sized, x: origin.x + position.x, y: origin.y + position.y };
  });

  assertNoOverlaps(overriddenNodes);

  const nodeById = new Map(overriddenNodes.map((n) => [n.id, n]));
  const router = createSequentialRouter();
  const reRoutedEdges = autoPositioned.edges.map((edge) => {
    if (!pinnedIds.has(edge.sourceId) && !pinnedIds.has(edge.targetId) && !(edge.waypoints?.length)) return edge;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return edge;
    const auto = facingSides(source, target);
    const fromSide = edge.from ?? auto.from;
    const toSide = edge.to ?? auto.to;
    // Bounding-box side midpoint, not the true circle/diamond outline intersection: matches
    // @bpm/layout-engine-swimlane's laneBanding routeWithStubs, which is what actually produces
    // a diagram's on-screen edges for the common (lane) case. outlineAnchor's outline-aware
    // intersection ignores `side` and aims straight at the other endpoint's raw center whenever
    // `toward` is given, so once a pinned-node edit forced this path to reroute around bends the
    // diagonal intersection no longer lined up with them — producing edges that didn't match what
    // the same diagram looked like straight out of the editor/generator (found via a real
    // diagram-to-text round trip: a canvas edit's re-export visibly kinked at every event/gateway
    // endpoint that the initial layout hadn't).
    const start = sideOf(source, fromSide);
    const end = sideOf(target, toSide);
    const obstacles = [...nodeById.values()].filter((n) => n.id !== source.id && n.id !== target.id);
    const middle = middleRoute(
      edge, start, end, obstacles, router,
      waypointMapper(diagramById.get(edge.sourceId), source),
    );
    return { ...edge, points: [start, ...middle, end] };
  });

  return { pools: autoPositioned.pools, nodes: overriddenNodes, edges: reRoutedEdges };
}
