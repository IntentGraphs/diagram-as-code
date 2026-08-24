import type { Diagram, Side } from '@bpm/ast';
import { createSequentialRouter, portOnShape, stubFrom, HORIZONTAL_POOL_HEADER_WIDTH, type PositionedDiagram, type PositionedNode, type PositionedLane, type RoutedEdge } from '@bpm/layout-core';
import type { PreferredFirstTurn, RouteEdgeClass } from '@bpm/diagram-core';
import { getSpacingProfile } from '@bpm/layout-core';
import { assignTracks, type ChannelInterval } from './channelRouting.js';
import { assignPorts } from './portAllocation.js';
import { normalizeSequencePlacement } from './sequencePlacement.js';

const POOL_TOP_PADDING = 12;
/** Horizontal/vertical clearance past a node bbox before the first orthogonal turn. */
const EDGE_STUB = 14;
const PORT_SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

function closestPortSide(node: PositionedNode, point: { x: number; y: number }): Side {
  return PORT_SIDES.reduce((closest, side) => {
    const candidate = portOnShape(node, side);
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    return distance < closest.distance ? { side, distance } : closest;
  }, { side: 'left' as Side, distance: Number.POSITIVE_INFINITY }).side;
}

function portOffset(node: PositionedNode, side: Side, point: { x: number; y: number }): number {
  return side === 'left' || side === 'right'
    ? point.y - (node.y + node.height / 2)
    : point.x - (node.x + node.width / 2);
}

function resolveFinalPorts(edges: RoutedEdge[], nodes: PositionedNode[]): RoutedEdge[] {
  const nodeById = new Map(flattenPositioned(nodes).map((node) => [node.id, node]));
  return edges.map((edge) => {
    if (edge.points.length < 2) return edge;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return edge;
    return {
      ...edge,
      resolvedFrom: closestPortSide(source, edge.points[0]),
      resolvedTo: closestPortSide(target, edge.points[edge.points.length - 1]),
      resolvedFromOffset: portOffset(source, closestPortSide(source, edge.points[0]), edge.points[0]),
      resolvedToOffset: portOffset(target, closestPortSide(target, edge.points[edge.points.length - 1]), edge.points[edge.points.length - 1]),
    };
  });
}

function facingSides(source: { x: number; y: number; width: number; height: number }, target: { x: number; y: number; width: number; height: number }): { from: Side; to: Side } {
  const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
  const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

function flattenPositioned(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flattenPositioned(node.children, into);
  }
  return into;
}

function laneLabelObstacles(pools: PositionedDiagram['pools']) {
  return pools.flatMap((pool) => pool.lanes.map((lane) => ({
    // Lane labels are rendered at the lane origin and are intentionally treated as
    // visual obstacles for message corridors, even though they are not BPMN nodes.
    x: lane.x,
    y: lane.y,
    width: Math.max(HORIZONTAL_POOL_HEADER_WIDTH, lane.name.length * 7 + 12),
    height: 20,
  })));
}

/**
 * Rebuilds cross-pool routes after lane banding and pool repacking have finished.
 * Cross-pool routes are global geometry: translating their old pre-banding waypoints
 * cannot preserve clearance when either endpoint's pool moves independently.
 */
function rerouteCrossPoolEdges(
  edges: RoutedEdge[],
  nodes: PositionedNode[],
  poolOfNode: Map<string, string>,
  pools: PositionedDiagram['pools'],
  laneDirection: Diagram['laneDirection'],
  routing: Diagram['routing'] = undefined,
  readableEdgeGap = 10,
  shapeReadableGap = 16,
): RoutedEdge[] {
  // Fast and hybrid routing deliberately keep ELK's original cross-pool paths. Re-routing
  // them here would re-enter the expensive visibility-graph path for global message flows.
  if (routing === 'hybrid' || routing === 'fast') return edges;
  const nodeById = new Map(flattenPositioned(nodes).map((node) => [node.id, node]));
  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  const crossPool = edges.filter((edge) => {
    const sourcePool = poolOfNode.get(edge.sourceId);
    const targetPool = poolOfNode.get(edge.targetId);
    return sourcePool !== undefined && targetPool !== undefined && sourcePool !== targetPool;
  });
  if (crossPool.length === 0) return edges;

  const nodeObstacles = [...nodeById.values()];
  const visualObstacles = laneLabelObstacles(pools);
  const assignedPorts = assignPorts(crossPool, nodeById);
  const routerByPoolPair = new Map<string, ReturnType<typeof createSequentialRouter>>();
  const rerouted = new Map<string, Array<{ x: number; y: number }>>();

  for (const edge of crossPool) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) continue;
    const sourcePool = poolById.get(poolOfNode.get(edge.sourceId)!);
    const targetPool = poolById.get(poolOfNode.get(edge.targetId)!);
    const auto = sourcePool && targetPool
      ? poolFacingSides(sourcePool, targetPool, laneDirection, source, target)
      : facingSides(source, target);
    const ports = assignedPorts.get(edge.id);
    const from = ports?.source.side ?? edge.from ?? auto.from;
    const to = ports?.target.side ?? edge.to ?? auto.to;
    const start = portOnShape(source, from, ports?.source.offset ?? 0);
    const end = portOnShape(target, to, ports?.target.offset ?? 0);
    const exitStub = stubFrom(start, from, EDGE_STUB);
    const entryStub = stubFrom(end, to, EDGE_STUB);
    const obstacles = [
      ...nodeObstacles.filter((node) => node.id !== source.id && node.id !== target.id),
      ...visualObstacles,
    ];
    // Keep route corridors scoped to a directed pool pair for this bounded
    // experiment. The shared port allocation still separates fan-in/fan-out;
    // global reverse-direction interaction scoring remains a follow-up once the
    // router can score external paths without turning them into hard obstacles.
    const pairKey = `${poolOfNode.get(edge.sourceId)}->${poolOfNode.get(edge.targetId)}`;
    const router = routerByPoolPair.get(pairKey) ?? createSequentialRouter({ edgeObstaclePolicy: 'hard' });
    routerByPoolPair.set(pairKey, router);
    const preferredFirstTurn: PreferredFirstTurn = from === 'left' || from === 'right' ? 'vertical' : 'horizontal';
    const edgeClass: RouteEdgeClass = edge.flowType === 'message'
      ? 'message'
      : edge.flowType === 'association' ? 'association' : 'sequence';
    const messageFlow = edge.flowType === 'message';
    rerouted.set(edge.id, [start, ...router.route(
      exitStub,
      entryStub,
      obstacles,
      preferredFirstTurn,
      messageFlow ? 'soft' : 'hard',
      {
        edgeClass,
        readableEdgeGap,
        shapeReadableGap,
      },
    ), end]);
  }

  return edges.map((edge) => rerouted.has(edge.id) ? { ...edge, points: rerouted.get(edge.id)! } : edge);
}

function poolFacingSides(
  sourcePool: PositionedDiagram['pools'][number],
  targetPool: PositionedDiagram['pools'][number],
  laneDirection: Diagram['laneDirection'],
  source: PositionedNode,
  target: PositionedNode,
): { from: Side; to: Side } {
  if (laneDirection === 'vertical') {
    const sourceCenter = sourcePool.x + sourcePool.width / 2;
    const targetCenter = targetPool.x + targetPool.width / 2;
    if (Math.abs(targetCenter - sourceCenter) > 1) {
      return targetCenter >= sourceCenter ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
    }
  } else {
    const sourceCenter = sourcePool.y + sourcePool.height / 2;
    const targetCenter = targetPool.y + targetPool.height / 2;
    if (Math.abs(targetCenter - sourceCenter) > 1) {
      return targetCenter >= sourceCenter ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
    }
  }
  return facingSides(source, target);
}

function shiftNodeRecursively(node: PositionedNode, deltaY: number): PositionedNode {
  const shifted: PositionedNode = { ...node, y: node.y + deltaY };
  if (node.children) shifted.children = node.children.map((c) => shiftNodeRecursively(c, deltaY));
  if (node.childEdges) {
    shifted.childEdges = node.childEdges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: p.x, y: p.y + deltaY })),
    }));
  }
  return shifted;
}

/**
 * Arranges each pool's lanes as full-width horizontal bands stacked top-to-bottom in
 * declaration order — the standard BPMN swimlane convention — instead of letting ELK's
 * layered algorithm place each lane as an independently-sized, independently-positioned
 * box (which produced scattered, overlapping-looking lanes). Runs on the flat pool layout
 * toElkGraph/fromElkLayout already produced; only vertical position changes, so column
 * (x) ordering from the flow's own layout is preserved.
 *
 * Cross-lane edges still use assignTracks()/channelGap to size reserved gaps between
 * bands (overlapping spans need enough vertical room). The polyline between each edge's
 * exit and entry stubs — same-lane and cross-lane — is routed by createSequentialRouter
 * so later edges avoid earlier ones without hand-assigned track y-levels.
 *
 * Called only by the swimlane engine; the flat engine never invokes this pass.
 */
function horizontalBandLanes(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const profile = getSpacingProfile(diagram.layoutSpacing);
  const swimlaneProfile = profile as typeof profile & { laneChannelBaseGap: number; poolStackGap: number };
  const LANE_VERTICAL_PADDING = profile.laneVerticalPadding;

  const positionedNodeById = new Map(flattenPositioned(positioned.nodes).map((n) => [n.id, n]));
  const deltaYById = new Map<string, number>();
  const allChannelRepairedEdgeIds = new Set<string>();
  const repairedEdgePoints = new Map<string, Array<{ x: number; y: number }>>();

  const newPools = positioned.pools.map((positionedPool) => {
    const pool = diagram.pools.find((p) => p.id === positionedPool.id);
    if (!pool || pool.lanes.length === 0) return positionedPool;

    const laneIndexByNodeId = new Map<string, number>();
    pool.lanes.forEach((lane, index) => {
      for (const id of lane.nodeIds) laneIndexByNodeId.set(id, index);
    });

    const lanesNodes = pool.lanes.map((lane) =>
      lane.nodeIds.map((id) => positionedNodeById.get(id)).filter((n): n is PositionedNode => Boolean(n)),
    );
    const allPoolNodes = lanesNodes.flat();
    if (allPoolNodes.length === 0) return positionedPool;

    const naturalSpreads = lanesNodes.map((nodes) => {
      if (nodes.length === 0) return { min: 0, spread: 0 };
      const min = Math.min(...nodes.map((n) => n.y));
      const max = Math.max(...nodes.map((n) => n.y + n.height));
      return { min, spread: max - min };
    });
    // Size each band from its own content. Using the pool-wide maximum here makes a
    // sparse lane inherit the height of the busiest lane, which can dominate the pool
    // canvas for diagrams with data/artifact lanes.
    const laneHeights = naturalSpreads.map(({ spread }) => spread + LANE_VERTICAL_PADDING * 2);

    // Determine which cross-lane edges pass through which channel(s), using ELK's ORIGINAL
    // (pre-banding) x-positions — banding never changes x, so these spans are already final.
    const channelIntervals: ChannelInterval[] = [];
    const edgeById = new Map(positioned.edges.map((e) => [e.id, e]));
    for (const edge of positioned.edges) {
      const sourceLane = laneIndexByNodeId.get(edge.sourceId);
      const targetLane = laneIndexByNodeId.get(edge.targetId);
      if (sourceLane === undefined || targetLane === undefined || sourceLane === targetLane) continue;
      const lo = Math.min(sourceLane, targetLane);
      const hi = Math.max(sourceLane, targetLane);
      const channels = Array.from({ length: hi - lo }, (_, i) => lo + i);
      const sourceNode = positionedNodeById.get(edge.sourceId)!;
      const targetNode = positionedNodeById.get(edge.targetId)!;
      channelIntervals.push({
        id: edge.id,
        channels,
        start: Math.min(sourceNode.x, targetNode.x),
        end: Math.max(sourceNode.x + sourceNode.width, targetNode.x + targetNode.width),
      });
    }
    const trackByEdgeId = assignTracks(channelIntervals);
    const tracksByChannel = new Map<number, number>();
    for (const interval of [...channelIntervals].sort((a, b) => a.id.localeCompare(b.id))) {
      const track = trackByEdgeId.get(interval.id)!;
      for (const channel of interval.channels) {
        tracksByChannel.set(channel, Math.max(tracksByChannel.get(channel) ?? 0, track + 1));
      }
    }
    // First pass: reserve the profile minimum plus one track slot per competing
    // cross-lane interval. The bounded helper caps pathological growth.
    const channelGap = (channel: number) => {
      const boundedTracks = Math.max(0, Math.min(8, tracksByChannel.get(channel) ?? 0));
      return (swimlaneProfile.laneChannelBaseGap ?? profile.edgeEdgeBetweenLayers) + boundedTracks * profile.trackSpacing;
    };

    let currentY = positionedPool.y + POOL_TOP_PADDING;
    const positionedLanes: PositionedLane[] = [];
    pool.lanes.forEach((lane, index) => {
      const laneY = currentY;
      const laneHeight = laneHeights[index];
      positionedLanes.push({ id: lane.id, name: lane.name, x: positionedPool.x, y: laneY, width: positionedPool.width, height: laneHeight });
      const { min: naturalMin, spread: naturalSpread } = naturalSpreads[index];
      const centeringOffset = (laneHeight - naturalSpread) / 2;
      for (const node of lanesNodes[index]) {
        const newY = laneY + centeringOffset + (node.y - naturalMin);
        deltaYById.set(node.id, newY - node.y);
      }
      currentY += laneHeight;
      if (index < pool.lanes.length - 1) currentY += channelGap(index);
    });

    const poolNodeIds = new Set(allPoolNodes.map((node) => node.id));
    const poolEdges = positioned.edges.filter((edge) => poolNodeIds.has(edge.sourceId) && poolNodeIds.has(edge.targetId));
    const routedNodeById = new Map(allPoolNodes.map((node) => [node.id, {
      ...node,
      y: node.y + (deltaYById.get(node.id) ?? 0),
    }]));
    const assignedPorts = assignPorts(poolEdges, routedNodeById);

    // In quality mode, build each cross-lane edge's real path with the shared orthogonal router, instead of
    // linearly interpolating the old (now-invalid) ELK path. Each edge side-exits the source
    // with a short stub (avoids bottom-edge boundary events and keeps the first turn clear of
    // round/diamond outlines), then the router finds the shortest obstacle-clearing orthogonal
    // path to a matching stub on the target's facing side. The router remembers each routed
    // edge's path as an obstacle for subsequent edges. Fast mode skips this post-banding
    // reroute and retains ELK's initial paths; hybrid retains this quality local-pool reroute
    // while using bounded global message paths. Cross-lane local-pool routes keep
    // shape clearance hard, but may accept a much shorter shape-safe path when hard edge
    // avoidance creates a severe detour. Same-lane routes and cross-pool message routes
    // remain hard-obstacle routed.
    const router = createSequentialRouter({
      edgeObstaclePolicy: diagram.routing === 'fast' ? 'none' : 'hard',
    });
    const routeWithStubs = (edge: (typeof positioned.edges)[number]) => {
      const source = positionedNodeById.get(edge.sourceId)!;
      const target = positionedNodeById.get(edge.targetId)!;
      const sourceDelta = deltaYById.get(edge.sourceId) ?? 0;
      const targetDelta = deltaYById.get(edge.targetId) ?? 0;
      const ports = assignedPorts.get(edge.id);
      if (!ports) return;
      const start = portOnShape({ ...source, y: source.y + sourceDelta }, ports.source.side, ports.source.offset);
      const fromSide = ports.source.side;
      const exitStub = stubFrom(start, fromSide, EDGE_STUB);
      const end = portOnShape({ ...target, y: target.y + targetDelta }, ports.target.side, ports.target.offset);
      const toSide = ports.target.side;
      const entryStub = stubFrom(end, toSide, EDGE_STUB);
      // Obstacles need each node's FINAL (post-banding) rectangle, since deltaYById is fully
      // populated for every node in the pool by this point (computed in the loop above) but
      // hasn't been written back onto the positioned nodes yet.
      const obstacles = allPoolNodes
        .filter((n) => n.id !== edge.sourceId && n.id !== edge.targetId)
        .map((n) => ({ ...n, y: n.y + (deltaYById.get(n.id) ?? 0) }));
      const preferredFirstTurn: PreferredFirstTurn = fromSide === 'left' || fromSide === 'right' ? 'vertical' : 'horizontal';
      const sourceLane = laneIndexByNodeId.get(edge.sourceId);
      const targetLane = laneIndexByNodeId.get(edge.targetId);
      const edgeObstaclePolicy = diagram.routing === 'fast'
        ? 'none'
        : sourceLane !== undefined && targetLane !== undefined && sourceLane !== targetLane
          ? 'soft'
          : 'hard';
      const edgeClass: RouteEdgeClass = edge.flowType === 'message'
        ? 'message'
        : edge.flowType === 'association' ? 'association' : 'sequence';
      const middlePoints = router.route(exitStub, entryStub, obstacles, preferredFirstTurn, edgeObstaclePolicy, {
        edgeClass,
        readableEdgeGap: Math.max(8, profile.edgeEdge / 2),
        shapeReadableGap: Math.max(12, Math.min(24, profile.edgeNode / 2)),
      });
      repairedEdgePoints.set(edge.id, [start, ...middlePoints, end]);
      allChannelRepairedEdgeIds.add(edge.id);
    };
    if (diagram.routing !== 'fast') {
      for (const interval of channelIntervals) {
        const edge = edgeById.get(interval.id)!;
        routeWithStubs(edge);
      }
      // Same-lane edges used to skip the router and re-shift ELK's waypoints, interpolating
      // the Y-shift by array index. Each node can have its own banding offset, so a middle
      // corner received a blend that matched neither endpoint and turned an orthogonal
      // dogleg into a diagonal. Route them through the same stub + sequential router path.
      for (const edge of positioned.edges) {
        if (allChannelRepairedEdgeIds.has(edge.id)) continue;
        const sourceLane = laneIndexByNodeId.get(edge.sourceId);
        const targetLane = laneIndexByNodeId.get(edge.targetId);
        if (sourceLane === undefined || targetLane === undefined || sourceLane !== targetLane) continue;
        routeWithStubs(edge);
      }
    }

    return {
      ...positionedPool,
      // The label strip is part of the pool geometry. Nodes are shifted below after
      // all lane bands have been sized, so ELK can keep its content layout unchanged.
      width: positionedPool.width + HORIZONTAL_POOL_HEADER_WIDTH,
      height: currentY - positionedPool.y,
      // Keep the participant label in the pool's left strip and move lane labels/content
      // into the adjacent strip. bpmn-js renders participant and lane labels from their
      // respective shape origins; leaving both at pool.x makes the names overlap.
      lanes: positionedLanes.map((lane) => ({
        ...lane,
        x: lane.x + HORIZONTAL_POOL_HEADER_WIDTH,
        width: lane.width,
      })),
    };
  });

  // Banding can make a pool taller than the preliminary ELK box used to place its
  // siblings. Repack in visual order using final pool heights before routing/export.
  const poolDeltaY = new Map<string, number>();
  let packedBottom = -Infinity;
  [...newPools]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((pool) => {
      const delta = Math.max(0, packedBottom + (swimlaneProfile.poolStackGap ?? 28) - pool.y);
      poolDeltaY.set(pool.id, delta);
      packedBottom = pool.y + delta + pool.height;
    });
  const poolOfNode = new Map<string, string>();
  diagram.pools.forEach((pool) => pool.lanes.forEach((lane) => lane.nodeIds.forEach((id) => poolOfNode.set(id, pool.id))));

  const newNodes = positioned.nodes.map((node) => {
    const poolDelta = poolDeltaY.get(poolOfNode.get(node.id) ?? '') ?? 0;
    const yDelta = (deltaYById.get(node.id) ?? 0) + poolDelta;
    const xDelta = poolOfNode.has(node.id) ? HORIZONTAL_POOL_HEADER_WIDTH : 0;
    let shifted = xDelta ? shiftNodeXRecursively(node, xDelta) : node;
    return yDelta ? shiftNodeRecursively(shifted, yDelta) : shifted;
  });

  const finalPools = newPools.map((pool) => {
    const delta = poolDeltaY.get(pool.id) ?? 0;
    return delta
      ? { ...pool, y: pool.y + delta, lanes: pool.lanes.map((lane) => ({ ...lane, y: lane.y + delta })) }
      : pool;
  });

  const newEdges = positioned.edges.map((edge) => {
    const bandedPoints = allChannelRepairedEdgeIds.has(edge.id)
      ? repairedEdgePoints.get(edge.id)!
      : edge.points;
    const sourcePool = poolOfNode.get(edge.sourceId);
    const targetPool = poolOfNode.get(edge.targetId);
    // Repaired paths already include the lane-banding delta in their endpoints;
    // only the later pool-packing delta remains to be applied to those paths.
    const sourceDeltaY = (allChannelRepairedEdgeIds.has(edge.id) ? 0 : deltaYById.get(edge.sourceId) ?? 0)
      + (poolDeltaY.get(sourcePool ?? '') ?? 0);
    const targetDeltaY = (allChannelRepairedEdgeIds.has(edge.id) ? 0 : deltaYById.get(edge.targetId) ?? 0)
      + (poolDeltaY.get(targetPool ?? '') ?? 0);
    const sourceDeltaX = sourcePool ? HORIZONTAL_POOL_HEADER_WIDTH : 0;
    const targetDeltaX = targetPool ? HORIZONTAL_POOL_HEADER_WIDTH : 0;
    if (allChannelRepairedEdgeIds.has(edge.id) || sourcePool || targetPool) {
      const sourceNode = positionedNodeById.get(edge.sourceId);
      const targetNode = positionedNodeById.get(edge.targetId);
      const sourceY = sourceNode ? sourceNode.y + sourceNode.height / 2 : 0;
      const targetY = targetNode ? targetNode.y + targetNode.height / 2 : 0;
      return {
        ...edge,
        points: bandedPoints.map((point) => {
          const nearSource = Math.abs(point.y - sourceY) <= Math.abs(point.y - targetY);
          return {
            x: point.x + (nearSource ? sourceDeltaX : targetDeltaX),
            y: point.y + (nearSource ? sourceDeltaY : targetDeltaY),
          };
        }),
      };
    }
    // Leftover edges (cross-pool, or an endpoint with no lane): snap each waypoint to
    // whichever endpoint's shift it is actually nearer to. Interpolating by array index
    // blended the two offsets onto middle corners and de-orthogonalized ELK's path.
    const deltaSource = deltaYById.get(edge.sourceId);
    const deltaTarget = deltaYById.get(edge.targetId);
    if (deltaSource === undefined && deltaTarget === undefined) return edge;
    const dSource = deltaSource ?? 0;
    const dTarget = deltaTarget ?? 0;
    const sourceNode = positionedNodeById.get(edge.sourceId);
    const targetNode = positionedNodeById.get(edge.targetId);
    const sourceY = sourceNode ? sourceNode.y + sourceNode.height / 2 : 0;
    const targetY = targetNode ? targetNode.y + targetNode.height / 2 : 0;
    return {
      ...edge,
      points: edge.points.map((p) => {
        const d = Math.abs(p.y - sourceY) <= Math.abs(p.y - targetY) ? dSource : dTarget;
        return { x: p.x, y: p.y + d };
      }),
    };
  });

  const finalEdges = rerouteCrossPoolEdges(
    newEdges,
    newNodes,
    poolOfNode,
    finalPools,
    diagram.laneDirection,
    diagram.routing,
    Math.max(8, profile.edgeEdge / 2),
    Math.max(12, Math.min(24, profile.edgeNode / 2)),
  );

  return {
    pools: finalPools,
    nodes: newNodes,
    edges: resolveFinalPorts(finalEdges, newNodes),
  };
}

function shiftNodeXRecursively(node: PositionedNode, deltaX: number): PositionedNode {
  const shifted: PositionedNode = { ...node, x: node.x + deltaX };
  if (node.children) shifted.children = node.children.map((child) => shiftNodeXRecursively(child, deltaX));
  if (node.childEdges) {
    shifted.childEdges = node.childEdges.map((edge) => ({
      ...edge,
      points: edge.points.map((point) => ({ x: point.x + deltaX, y: point.y })),
    }));
  }
  return shifted;
}

const MIN_LANE_WIDTH = 128;
const VERTICAL_POOL_TOP_PADDING = 12;
const VERTICAL_LANE_GAP = 8;

function verticalShiftNodeRecursively(node: PositionedNode, deltaX: number): PositionedNode {
  const shifted: PositionedNode = { ...node, x: node.x + deltaX };
  if (node.children) shifted.children = node.children.map((child) => verticalShiftNodeRecursively(child, deltaX));
  if (node.childEdges) shifted.childEdges = node.childEdges.map((edge) => ({
    ...edge,
    points: edge.points.map((point) => ({ x: point.x + deltaX, y: point.y })),
  }));
  return shifted;
}

/** Composes BPMN lanes left-to-right while retaining ELK's rightward process flow within them. */
function verticalBandLanes(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const profile = getSpacingProfile(diagram.layoutSpacing);
  const horizontalPadding = profile.laneVerticalPadding;
  const positionedNodeById = new Map(flattenPositioned(positioned.nodes).map((node) => [node.id, node]));
  const deltaXById = new Map<string, number>();
  const repairedEdgePoints = new Map<string, Array<{ x: number; y: number }>>();
  const repairedEdges = new Set<string>();

  const pools = positioned.pools.map((positionedPool) => {
    const pool = diagram.pools.find((candidate) => candidate.id === positionedPool.id);
    if (!pool || pool.lanes.length === 0) return positionedPool;
    const laneIndexByNodeId = new Map<string, number>();
    pool.lanes.forEach((lane, index) => lane.nodeIds.forEach((id) => laneIndexByNodeId.set(id, index)));
    const laneNodes = pool.lanes.map((lane) => lane.nodeIds.map((id) => positionedNodeById.get(id)).filter((node): node is PositionedNode => Boolean(node)));
    const allPoolNodes = laneNodes.flat();
    if (allPoolNodes.length === 0) return positionedPool;

    const spreads = laneNodes.map((nodes) => {
      if (nodes.length === 0) return { min: 0, spread: 0 };
      const min = Math.min(...nodes.map((node) => node.x));
      const max = Math.max(...nodes.map((node) => node.x + node.width));
      return { min, spread: max - min };
    });
    const widths = pool.lanes.map((lane, index) => Math.max(
      MIN_LANE_WIDTH,
      spreads[index].spread + horizontalPadding * 2,
      lane.name.length * 7 + 28,
    ));
    const contentMinY = Math.min(...allPoolNodes.map((node) => node.y));
    const contentMaxY = Math.max(...allPoolNodes.map((node) => node.y + node.height));
    const poolHeight = Math.max(1, contentMaxY - contentMinY + horizontalPadding * 2 + VERTICAL_POOL_TOP_PADDING);
    const laneY = positionedPool.y + VERTICAL_POOL_TOP_PADDING;
    let currentX = positionedPool.x;
    const lanes: PositionedLane[] = [];
    pool.lanes.forEach((lane, index) => {
      const width = widths[index];
      lanes.push({ id: lane.id, name: lane.name, x: currentX, y: laneY, width, height: poolHeight - VERTICAL_POOL_TOP_PADDING });
      const { min, spread } = spreads[index];
      const offset = (width - spread) / 2;
      for (const node of laneNodes[index]) deltaXById.set(node.id, currentX + offset + (node.x - min) - node.x);
      currentX += width + (index < pool.lanes.length - 1 ? VERTICAL_LANE_GAP : 0);
    });

    const poolNodeIds = new Set(allPoolNodes.map((node) => node.id));
    const poolEdges = positioned.edges.filter((edge) => poolNodeIds.has(edge.sourceId) && poolNodeIds.has(edge.targetId));
    const routedNodeById = new Map(allPoolNodes.map((node) => [node.id, {
      ...node,
      x: node.x + (deltaXById.get(node.id) ?? 0),
    }]));
    const assignedPorts = assignPorts(poolEdges, routedNodeById);

    const router = createSequentialRouter({
      edgeObstaclePolicy: diagram.routing === 'fast' ? 'none' : 'hard',
    });
    const routeEdge = (edge: (typeof positioned.edges)[number]) => {
      const source = positionedNodeById.get(edge.sourceId);
      const target = positionedNodeById.get(edge.targetId);
      if (!source || !target) return;
      const sourceDelta = deltaXById.get(source.id) ?? 0;
      const targetDelta = deltaXById.get(target.id) ?? 0;
      const ports = assignedPorts.get(edge.id);
      if (!ports) return;
      const from = ports.source.side;
      const to = ports.target.side;
      const start = portOnShape({ ...source, x: source.x + sourceDelta }, from, ports.source.offset);
      const end = portOnShape({ ...target, x: target.x + targetDelta }, to, ports.target.offset);
      const exitStub = stubFrom(start, from, EDGE_STUB);
      const entryStub = stubFrom(end, to, EDGE_STUB);
      const obstacles = allPoolNodes
        .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
        .map((node) => ({ ...node, x: node.x + (deltaXById.get(node.id) ?? 0) }));
      const preferredFirstTurn: PreferredFirstTurn = from === 'left' || from === 'right' ? 'vertical' : 'horizontal';
      const sourceLane = laneIndexByNodeId.get(edge.sourceId);
      const targetLane = laneIndexByNodeId.get(edge.targetId);
      const edgeObstaclePolicy = diagram.routing === 'fast'
        ? 'none'
        : sourceLane !== undefined && targetLane !== undefined && sourceLane !== targetLane
          ? 'soft'
          : 'hard';
      const edgeClass: RouteEdgeClass = edge.flowType === 'message'
        ? 'message'
        : edge.flowType === 'association' ? 'association' : 'sequence';
      repairedEdgePoints.set(edge.id, [start, ...router.route(
        exitStub,
        entryStub,
        obstacles,
        preferredFirstTurn,
        edgeObstaclePolicy,
        {
          edgeClass,
          readableEdgeGap: Math.max(8, profile.edgeEdge / 2),
          shapeReadableGap: Math.max(12, Math.min(24, profile.edgeNode / 2)),
        },
      ), end]);
      repairedEdges.add(edge.id);
    };
    if (diagram.routing !== 'fast') {
      for (const edge of positioned.edges) {
        const sourceLane = laneIndexByNodeId.get(edge.sourceId);
        const targetLane = laneIndexByNodeId.get(edge.targetId);
        if (sourceLane !== undefined && targetLane !== undefined && sourceLane !== targetLane) routeEdge(edge);
      }
      for (const edge of positioned.edges) {
        const sourceLane = laneIndexByNodeId.get(edge.sourceId);
        const targetLane = laneIndexByNodeId.get(edge.targetId);
        if (!repairedEdges.has(edge.id) && sourceLane !== undefined && sourceLane === targetLane) routeEdge(edge);
      }
    }
    return { ...positionedPool, x: positionedPool.x, width: currentX - positionedPool.x, height: poolHeight, lanes };
  });

  const nodes = positioned.nodes.map((node) => {
    const delta = deltaXById.get(node.id);
    return delta ? verticalShiftNodeRecursively(node, delta) : node;
  });
  const edges = positioned.edges.map((edge) => {
    if (repairedEdges.has(edge.id)) return { ...edge, points: repairedEdgePoints.get(edge.id)! };
    const sourceDelta = deltaXById.get(edge.sourceId);
    const targetDelta = deltaXById.get(edge.targetId);
    if (sourceDelta === undefined && targetDelta === undefined) return edge;
    const source = positionedNodeById.get(edge.sourceId);
    const target = positionedNodeById.get(edge.targetId);
    const sourceX = source ? source.x + source.width / 2 : 0;
    const targetX = target ? target.x + target.width / 2 : 0;
    return { ...edge, points: edge.points.map((point) => ({ x: point.x + (Math.abs(point.x - sourceX) <= Math.abs(point.x - targetX) ? sourceDelta ?? 0 : targetDelta ?? 0), y: point.y })) };
  });
  const finalEdges = rerouteCrossPoolEdges(
    edges,
    nodes,
    new Map(
      diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds.map((id) => [id, pool.id] as const))),
    ),
    pools,
    diagram.laneDirection,
    diagram.routing,
    Math.max(8, profile.edgeEdge / 2),
    Math.max(12, Math.min(24, profile.edgeNode / 2)),
  );

  return {
    pools,
    nodes,
    edges: resolveFinalPorts(finalEdges, nodes),
  };
}

export function bandLanes(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const profile = getSpacingProfile(diagram.layoutSpacing);
  const sequencePlaced = normalizeSequencePlacement(diagram, positioned, {
    nodeGap: profile.nodeNodeBetweenLayers,
    branchGap: profile.nodeNode,
  });
  return diagram.laneDirection === 'vertical' ? verticalBandLanes(diagram, sequencePlaced) : horizontalBandLanes(diagram, sequencePlaced);
}
