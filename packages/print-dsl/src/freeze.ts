import type { Diagram, DiagramEdge, DiagramNode, Position } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '@bpm/layout-core';

interface Origin { x: number; y: number }

const ROOT_ORIGIN: Origin = { x: 0, y: 0 };

function isBoundary(node: DiagramNode): boolean {
  return node.kind === 'event' && node.attachedToId !== undefined;
}

function findPositioned(nodes: PositionedNode[] | undefined, id: string): PositionedNode | undefined {
  for (const node of nodes ?? []) {
    if (node.id === id) return node;
    const nested = findPositioned(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

function subtract(point: { x: number; y: number }, origin: Origin): Position {
  return { x: point.x - origin.x, y: point.y - origin.y };
}

function laneOrigins(diagram: Diagram, positioned: PositionedDiagram): Map<string, Origin> {
  const result = new Map<string, Origin>();
  for (const pool of diagram.pools) {
    const positionedPool = positioned.pools.find((candidate) => candidate.id === pool.id);
    if (!positionedPool) continue;
    for (const lane of pool.lanes) {
      const positionedLane = positionedPool.lanes.find((candidate) => candidate.id === lane.id);
      if (!positionedLane) continue;
      for (const nodeId of lane.nodeIds) result.set(nodeId, { x: positionedLane.x, y: positionedLane.y });
    }
  }
  return result;
}

/** Infer an expanded subprocess content origin from one positioned child. */
function childOrigin(
  astChildren: DiagramNode[],
  positionedChildren: PositionedNode[] | undefined,
  parent: PositionedNode,
): Origin {
  for (const child of astChildren) {
    if (isBoundary(child) || !child.position) continue;
    const placed = findPositioned(positionedChildren, child.id);
    if (placed) return { x: placed.x - child.position.x, y: placed.y - child.position.y };
  }
  // Matches layout-engine-manual's current subprocess content inset for an empty scope.
  return { x: parent.x + 12, y: parent.y + 20 };
}

function edgeMap(edges: RoutedEdge[]): Map<string, RoutedEdge> {
  return new Map(edges.map((edge) => [edge.id, edge]));
}

function freezeEdges(
  edges: DiagramEdge[],
  positionedEdges: RoutedEdge[],
  astById: Map<string, DiagramNode>,
  originByNodeId: Map<string, Origin>,
): DiagramEdge[] {
  const routedById = edgeMap(positionedEdges);
  return edges.map((edge) => {
    const source = astById.get(edge.sourceId);
    const target = astById.get(edge.targetId);
    const routed = routedById.get(edge.id);

    // Boundary events are placed after ordinary nodes by the shared boundary pass. Keep those
    // routes automatic; their final coordinates are not expressible as node `at` positions.
    if (!routed || !source || !target || isBoundary(source) || isBoundary(target) || routed.points.length < 3) {
      return { ...edge };
    }

    const origin = originByNodeId.get(source.id) ?? ROOT_ORIGIN;
    return {
      ...edge,
      waypoints: routed.points.slice(1, -1).map((point) => subtract(point, origin)),
    };
  });
}

/**
 * Convert a successfully laid-out diagram into a manual-positioned snapshot.
 *
 * Coordinates are rebased into the DSL's actual frames: lane-local for pooled nodes,
 * subprocess-content-local for nested nodes, and canvas-absolute for root nodes. Resolved edge
 * interiors become `via` points where possible. Boundary-event routes remain automatic because
 * their placement is owned by the shared boundary pass.
 */
export function freezeDiagram(diagram: Diagram, positioned: PositionedDiagram): Diagram {
  const laneOriginByNodeId = laneOrigins(diagram, positioned);
  const positionedRootEdges = positioned.edges;
  const astRootById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const rootOrigins = new Map<string, Origin>();
  for (const node of diagram.nodes) rootOrigins.set(node.id, laneOriginByNodeId.get(node.id) ?? ROOT_ORIGIN);

  const freezeNodeTree = (astNodes: DiagramNode[], placedNodes: PositionedNode[], defaultOrigin: Origin): DiagramNode[] => {
    const placedById = new Map(placedNodes.map((node) => [node.id, node]));
    return astNodes.map((node) => {
      const placed = placedById.get(node.id);
      const origin = laneOriginByNodeId.get(node.id) ?? defaultOrigin;
      if (!placed || isBoundary(node)) return { ...node };
      const base: DiagramNode = {
        ...node,
        position: subtract(placed, origin),
        sizeHint: { width: placed.width, height: placed.height },
      };
      if (node.kind !== 'activity' || node.collapsed) return base;

      const nestedOrigin = childOrigin(node.children, placed.children, placed);
      const children = freezeNodeTree(node.children, placed.children ?? [], nestedOrigin);
      const childEdgeMap = new Map((placed.childEdges ?? []).map((edge) => [edge.id, edge]));
      const childAstById = new Map(node.children.map((child) => [child.id, child]));
      const childOrigins = new Map(node.children.map((child) => [child.id, nestedOrigin]));
      return {
        ...base,
        children,
        childEdges: freezeEdges(node.childEdges, [...childEdgeMap.values()], childAstById, childOrigins),
      } as DiagramNode;
    });
  };

  const nodes = freezeNodeTree(diagram.nodes, positioned.nodes, ROOT_ORIGIN);
  const edges = freezeEdges(diagram.edges, positionedRootEdges, astRootById, rootOrigins);

  return { ...diagram, positioning: 'manual', nodes, edges };
}
