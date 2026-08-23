import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '@bpm/layout-core';

interface PlacementProfile {
  nodeGap: number;
  branchGap: number;
}

interface ComponentPlacement {
  nodeIds: string[];
  rankById: Map<string, number>;
}

function isSequenceEdge(edge: RoutedEdge): boolean {
  return edge.flowType === 'sequence'
    || edge.flowType === 'conditionalSequence'
    || edge.flowType === 'defaultSequence';
}

function flattenPositioned(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flattenPositioned(node.children, into);
  }
  return into;
}

function reachable(adjacency: Map<string, string[]>, start: string, target: string): boolean {
  const pending = [start];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

/**
 * Keep the earliest declared edge when a sequence cycle is closed. This makes
 * the package→complete edge the forward edge and the later complete→package
 * edge a feedback edge for ranking purposes. The feedback edge is still kept
 * in the diagram and is routed normally later.
 */
function forwardEdges(
  edges: RoutedEdge[],
  nodeOrder: Map<string, number>,
  edgeOrder: Map<string, number>,
): RoutedEdge[] {
  const adjacency = new Map<string, string[]>();
  const accepted: RoutedEdge[] = [];
  const ordered = edges
    .filter(isSequenceEdge)
    .sort((a, b) => (edgeOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (edgeOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || (nodeOrder.get(a.sourceId) ?? 0) - (nodeOrder.get(b.sourceId) ?? 0)
      || a.id.localeCompare(b.id));

  for (const edge of ordered) {
    if (edge.sourceId === edge.targetId) continue;
    const pathBackToSource = reachable(adjacency, edge.targetId, edge.sourceId);
    if (pathBackToSource) continue;
    const outgoing = adjacency.get(edge.sourceId) ?? [];
    outgoing.push(edge.targetId);
    adjacency.set(edge.sourceId, outgoing);
    accepted.push(edge);
  }
  return accepted;
}

function components(nodeIds: string[], edges: RoutedEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.push(edge.targetId);
    adjacency.get(edge.targetId)?.push(edge.sourceId);
  }
  const result: string[][] = [];
  const visited = new Set<string>();
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const pending = [id];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    result.push(component);
  }
  return result;
}

function rankComponent(nodeIds: string[], edges: RoutedEdge[], nodeOrder: Map<string, number>): ComponentPlacement {
  const nodeSet = new Set(nodeIds);
  const incoming = new Map(nodeIds.map((id) => [id, 0]));
  const outgoing = new Map<string, RoutedEdge[]>();
  for (const edge of edges) {
    if (!nodeSet.has(edge.sourceId) || !nodeSet.has(edge.targetId)) continue;
    const list = outgoing.get(edge.sourceId) ?? [];
    list.push(edge);
    outgoing.set(edge.sourceId, list);
    incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 0) + 1);
  }

  const rankById = new Map(nodeIds.map((id) => [id, 0]));
  const pending = nodeIds
    .filter((id) => (incoming.get(id) ?? 0) === 0)
    .sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
  let processed = 0;
  while (pending.length > 0) {
    const current = pending.shift()!;
    processed += 1;
    for (const edge of outgoing.get(current) ?? []) {
      rankById.set(edge.targetId, Math.max(rankById.get(edge.targetId) ?? 0, (rankById.get(current) ?? 0) + 1));
      const remaining = (incoming.get(edge.targetId) ?? 0) - 1;
      incoming.set(edge.targetId, remaining);
      if (remaining === 0) pending.push(edge.targetId);
    }
    pending.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
  }

  // Defensive fallback for malformed input: the cycle-breaking pass should
  // make this graph acyclic, but retain stable ranks if a future edge type is
  // added without being included above.
  if (processed < nodeIds.length) {
    for (const id of nodeIds) rankById.set(id, 0);
  }
  return { nodeIds, rankById };
}

function moveNode(node: PositionedNode, dx: number, dy: number): PositionedNode {
  const moved: PositionedNode = { ...node, x: node.x + dx, y: node.y + dy };
  if (node.children) moved.children = node.children.map((child) => moveNode(child, dx, dy));
  if (node.childEdges) {
    moved.childEdges = node.childEdges.map((edge) => ({
      ...edge,
      points: edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    }));
  }
  return moved;
}

function alignLaneY(
  laneNodeIds: string[],
  nodeById: Map<string, PositionedNode>,
  componentByNodeId: Map<string, ComponentPlacement>,
  nodeOrder: Map<string, number>,
  branchGap: number,
): Map<string, number> {
  const connected = laneNodeIds.filter((id) => componentByNodeId.has(id));
  if (connected.length === 0) return new Map();
  const baseline = connected.reduce((sum, id) => {
    const node = nodeById.get(id)!;
    return sum + node.y + node.height / 2;
  }, 0) / connected.length;
  const byRank = new Map<string, string[]>();
  for (const id of connected) {
    const component = componentByNodeId.get(id)!;
    const rank = component.rankById.get(id) ?? 0;
    const key = String(rank);
    const group = byRank.get(key) ?? [];
    group.push(id);
    byRank.set(key, group);
  }

  const result = new Map<string, number>();
  for (const group of byRank.values()) {
    group.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    if (group.length === 1) {
      const node = nodeById.get(group[0])!;
      result.set(group[0], baseline - node.height / 2 - node.y);
      continue;
    }
    const totalHeight = group.reduce((sum, id) => sum + nodeById.get(id)!.height, 0) + branchGap * (group.length - 1);
    let cursor = baseline - totalHeight / 2;
    for (const id of group) {
      const node = nodeById.get(id)!;
      const center = cursor + node.height / 2;
      result.set(id, center - (node.y + node.height / 2));
      cursor += node.height + branchGap;
    }
  }
  return result;
}

/**
 * Normalize swimlane node placement before ports and routes are computed.
 * Forward sequence ranks control X; ordinary nodes in the same lane share a
 * Y baseline, while same-rank branch alternatives retain deterministic gaps.
 */
export function normalizeSequencePlacement(
  diagram: Diagram,
  positioned: PositionedDiagram,
  profile: PlacementProfile,
): PositionedDiagram {
  const positionedById = new Map(flattenPositioned(positioned.nodes).map((node) => [node.id, node]));
  const nodeDeltas = new Map<string, { dx: number; dy: number }>();
  const nodeOrder = new Map(diagram.nodes.map((node, index) => [node.id, index]));
  const edgeOrder = new Map(diagram.edges.map((edge, index) => [edge.id, index]));

  for (const pool of diagram.pools) {
    const laneNodeIds = pool.lanes.flatMap((lane) => lane.nodeIds);
    const poolNodeSet = new Set(laneNodeIds);
    const poolNodes = laneNodeIds.map((id) => positionedById.get(id)).filter((node): node is PositionedNode => Boolean(node));
    const poolEdges = positioned.edges.filter((edge) => poolNodeSet.has(edge.sourceId) && poolNodeSet.has(edge.targetId) && isSequenceEdge(edge));
    if (poolNodes.length < 2 || poolEdges.length === 0) continue;

    const forward = forwardEdges(poolEdges, nodeOrder, edgeOrder);
    const componentsByNode = new Map<string, ComponentPlacement>();
    for (const ids of components(laneNodeIds, forward)) {
      if (ids.length < 2) continue;
      const component = rankComponent(ids, forward, nodeOrder);
      for (const id of ids) componentsByNode.set(id, component);
    }

    const placements = [...new Set(componentsByNode.values())];
    if (placements.length > 0) {
      const allRankedIds = placements.flatMap((placement) => placement.nodeIds);
      const minX = Math.min(...allRankedIds.map((id) => positionedById.get(id)!.x));
      const maxRank = Math.max(...placements.flatMap((placement) => [...placement.rankById.values()]));
      const rankWidth = new Map<number, number>();
      for (const placement of placements) {
        for (const [id, rank] of placement.rankById) {
          rankWidth.set(rank, Math.max(rankWidth.get(rank) ?? 0, positionedById.get(id)!.width));
        }
      }
      const rankX = new Map<number, number>();
      let cursor = minX;
      for (let rank = 0; rank <= maxRank; rank += 1) {
        rankX.set(rank, cursor);
        cursor += (rankWidth.get(rank) ?? 0) + profile.nodeGap;
      }
      for (const placement of placements) {
        for (const id of placement.nodeIds) {
          const node = positionedById.get(id)!;
          const x = rankX.get(placement.rankById.get(id) ?? 0) ?? node.x;
          nodeDeltas.set(id, { dx: x - node.x, dy: 0 });
        }
      }
    }

    for (const lane of pool.lanes) {
      const yDeltas = alignLaneY(lane.nodeIds, positionedById, componentsByNode, nodeOrder, profile.branchGap);
      for (const [id, dy] of yDeltas) {
        const existing = nodeDeltas.get(id) ?? { dx: 0, dy: 0 };
        nodeDeltas.set(id, { dx: existing.dx, dy });
      }
    }
  }

  if (nodeDeltas.size === 0) return positioned;
  const movedNodes = positioned.nodes.map((node) => {
    const delta = nodeDeltas.get(node.id);
    return delta ? moveNode(node, delta.dx, delta.dy) : node;
  });
  const movedById = new Map(flattenPositioned(movedNodes).map((node) => [node.id, node]));
  const pools = positioned.pools.map((pool) => {
    const poolNodeIds = diagram.pools.find((candidate) => candidate.id === pool.id)?.lanes.flatMap((lane) => lane.nodeIds) ?? [];
    const right = Math.max(
      pool.x + pool.width,
      ...poolNodeIds.map((id) => {
        const node = movedById.get(id);
        return node ? node.x + node.width : pool.x + pool.width;
      }),
    );
    return right > pool.x + pool.width ? { ...pool, width: right - pool.x } : pool;
  });
  return { ...positioned, pools, nodes: movedNodes };
}
