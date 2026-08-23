import type { Diagram, DiagramEdge, DiagramNode } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout-core';
import { createSequentialRouter, facingSides, middleRoute, outlineAnchor, routeOrthogonalFast, stubFrom, waypointMapper } from '@bpm/layout-core';
import { isBoundaryEventId } from './toElkGraph.js';

export interface ElkNode {
  id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; edges?: ElkEdge[];
}
export interface ElkEdgeSection {
  startPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[]; endPoint: { x: number; y: number };
}
export interface ElkEdge { id: string; sections?: ElkEdgeSection[]; container?: string }
interface ElkGraph { id?: string; children?: ElkNode[]; edges?: ElkEdge[] }

export type Origin = { x: number; y: number };

function abs(elkNode: ElkNode, offsetX: number, offsetY: number) {
  return { x: offsetX + (elkNode.x ?? 0), y: offsetY + (elkNode.y ?? 0) };
}

/**
 * With hierarchical layout ELK may hoist an edge into the lowest common ancestor of its
 * endpoints and report that ancestor via `container`; the section coordinates are then
 * relative to it rather than to the node the edge was declared under.
 */
export function collectOrigins(nodes: ElkNode[] | undefined, offsetX: number, offsetY: number, into: Map<string, Origin>): void {
  for (const node of nodes ?? []) {
    const origin = abs(node, offsetX, offsetY);
    into.set(node.id, origin);
    collectOrigins(node.children, origin.x, origin.y, into);
  }
}

export function routeEdges(
  elkEdges: ElkEdge[] | undefined,
  astByEdgeId: Map<string, DiagramEdge>,
  origins: Map<string, Origin>,
  fallback: Origin,
): RoutedEdge[] {
  return (elkEdges ?? []).flatMap((elkEdge) => {
    const astEdge = astByEdgeId.get(elkEdge.id);
    if (!astEdge) return [];
    const section = elkEdge.sections?.[0];
    const offset = (elkEdge.container ? origins.get(elkEdge.container) : undefined) ?? fallback;
    const points = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
          .map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }))
      : [];
    return [{ ...astEdge, points }];
  });
}

const RELATIONSHIP_EDGE_STUB = 14;

function edgePathObstacles(edges: RoutedEdge[]): Array<{ x: number; y: number; width: number; height: number }> {
  const thickness = 4;
  return edges.flatMap((edge) => edge.points.slice(0, -1).map((point, index) => {
    const next = edge.points[index + 1];
    return {
      x: Math.min(point.x, next.x) - thickness / 2,
      y: Math.min(point.y, next.y) - thickness / 2,
      width: Math.abs(next.x - point.x) + thickness,
      height: Math.abs(next.y - point.y) + thickness,
    };
  }));
}

function flattenPositioned(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flattenPositioned(node.children, into);
  }
  return into;
}

function isArtifact(node: PositionedNode): boolean {
  return node.kind === 'dataObject' || node.kind === 'dataStore';
}

/**
 * Associations are deliberately absent from ELK's ranking graph. Keep their artifacts near
 * the real process node they describe before routing the association, otherwise ELK is free
 * to place every unconnected data node in its first available rank.
 */
function positionAssociatedArtifacts(diagram: Diagram, positionedNodes: PositionedNode[]): void {
  const nodeById = new Map(flattenPositioned(positionedNodes).map((node) => [node.id, node]));
  const gap = 80;

  for (const edge of diagram.edges.filter((candidate) => candidate.flowType === 'association')) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) continue;

    const artifact = isArtifact(source) ? source : isArtifact(target) ? target : undefined;
    const anchor = artifact === source ? target : artifact === target ? source : undefined;
    if (!artifact || !anchor || artifact.position) continue;

    // Put the artifact on the side of the anchor that faces the artifact's original position.
    // This preserves a useful left/right relationship while keeping the artifact close enough
    // that the post-layout association router does not need a diagram-wide detour.
    const artifactWasLeft = artifact.x + artifact.width / 2 < anchor.x + anchor.width / 2;
    artifact.x = artifactWasLeft
      ? anchor.x - artifact.width - gap
      : anchor.x + anchor.width + gap;
  }
}

/**
 * Routes edges intentionally omitted from ELK's ranking graph. Associations and message
 * flows still belong in the final positioned diagram; they simply must not create ranks or
 * columns for the control-flow layout.
 */
function routeSupplementalEdges(
  astEdges: DiagramEdge[],
  laidOutEdgeIds: Set<string>,
  positionedNodes: PositionedNode[],
  astNodes: DiagramNode[],
  laidOutEdges: RoutedEdge[] = [],
  routing: Diagram['routing'] = 'quality',
): RoutedEdge[] {
  const nodeById = new Map(flattenPositioned(positionedNodes).map((node) => [node.id, node]));
  const astById = new Map(astNodes.map((node) => [node.id, node]));
  const router = createSequentialRouter();
  const nodeObstacles = [...nodeById.values()];
  const existingEdgeObstacles = edgePathObstacles(laidOutEdges);

  return astEdges
    .filter((edge) => !laidOutEdgeIds.has(edge.id))
    .filter((edge) => !isBoundaryEventId(astNodes, edge.sourceId) && !isBoundaryEventId(astNodes, edge.targetId))
    .flatMap((edge) => {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      if (!source || !target) return [];

      const auto = facingSides(source, target);
      const from = edge.from ?? auto.from;
      const to = edge.to ?? auto.to;
      const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const start = outlineAnchor(source, from, targetCenter);
      const end = outlineAnchor(target, to, sourceCenter);
      const exitStub = stubFrom(start, from, RELATIONSHIP_EDGE_STUB);
      const entryStub = stubFrom(end, to, RELATIONSHIP_EDGE_STUB);
      const obstacles = [
        ...nodeObstacles.filter((node) => node.id !== source.id && node.id !== target.id),
        ...(routing === 'hybrid' || routing === 'fast' ? [] : existingEdgeObstacles),
      ];
      const middle = routing === 'hybrid' || routing === 'fast'
        ? routeOrthogonalFast(exitStub, entryStub, obstacles, from === 'left' || from === 'right' ? 'vertical' : 'horizontal')
        : middleRoute(edge, exitStub, entryStub, obstacles, router, waypointMapper(astById.get(edge.sourceId), source));
      return [{ ...edge, points: [start, ...middle, end] }];
    });
}

export function positionNode(astNode: DiagramNode, elkNode: ElkNode, offsetX: number, offsetY: number, origins: Map<string, Origin>, routing: Diagram['routing'] = 'quality'): PositionedNode {
  const { x, y } = abs(elkNode, offsetX, offsetY);
  const dimensions = { x, y, width: elkNode.width ?? 0, height: elkNode.height ?? 0 };
  const base: PositionedNode = astNode.kind === 'activity'
    ? {
        kind: astNode.kind,
        id: astNode.id,
        label: astNode.label,
        activityType: astNode.activityType,
        collapsed: astNode.collapsed,
        ...dimensions,
      }
    : { ...astNode, ...dimensions };

  if (astNode.kind === 'activity' && (astNode.activityType === 'subProcess' || astNode.activityType === 'transaction') && !astNode.collapsed) {
    const childById = new Map(astNode.children.map((c) => [c.id, c]));
    const childEdgeById = new Map(astNode.childEdges.map((e) => [e.id, e]));
    base.children = (elkNode.children ?? [])
      .filter((c) => childById.has(c.id))
      .map((c) => positionNode(childById.get(c.id)!, c, x, y, origins, routing));
    const laidOutChildEdges = routeEdges(elkNode.edges, childEdgeById, origins, { x, y });
    const laidOutChildIds = new Set(laidOutChildEdges.map((edge) => edge.id));
    const supplementalChildEdges = routeSupplementalEdges(
      astNode.childEdges,
      laidOutChildIds,
      base.children,
      astNode.children,
      laidOutChildEdges,
      routing,
    );
    const childEdgesById = new Map([...laidOutChildEdges, ...supplementalChildEdges].map((edge) => [edge.id, edge]));
    base.childEdges = astNode.childEdges
      .map((edge) => childEdgesById.get(edge.id))
      .filter((edge): edge is RoutedEdge => Boolean(edge));
  }

  return base;
}

export function fromElkLayout(diagram: Diagram, elkGraph: ElkGraph): PositionedDiagram {
  const positionedNodes: PositionedNode[] = [];
  const positionedPools: PositionedPool[] = [];
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const origins = new Map<string, Origin>();
  collectOrigins(elkGraph.children, 0, 0, origins);
  if (elkGraph.id) origins.set(elkGraph.id, { x: 0, y: 0 });

  for (const elkChild of elkGraph.children ?? []) {
    const pool = diagram.pools.find((p) => p.id === elkChild.id);
    if (pool) {
      const poolPos = abs(elkChild, 0, 0);
      // Lane bands aren't known yet at this stage — @bpm/layout-engine-swimlane assigns
      // them afterward from this same flat node layout.
      for (const elkNode of elkChild.children ?? []) {
        const astNode = nodeById.get(elkNode.id);
        if (!astNode) continue;
        positionedNodes.push(positionNode(astNode, elkNode, poolPos.x, poolPos.y, origins, diagram.routing));
      }
      positionedPools.push({ id: pool.id, name: pool.name, x: poolPos.x, y: poolPos.y, width: elkChild.width ?? 0, height: elkChild.height ?? 0, lanes: [] });
    } else {
      const astNode = nodeById.get(elkChild.id);
      if (astNode) positionedNodes.push(positionNode(astNode, elkChild, 0, 0, origins, diagram.routing));
    }
  }

  positionAssociatedArtifacts(diagram, positionedNodes);

  const astEdgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const laidOutEdges = routeEdges(elkGraph.edges, astEdgeById, origins, { x: 0, y: 0 });
  const laidOutEdgeIds = new Set(laidOutEdges.map((edge) => edge.id));
  const supplementalEdges = routeSupplementalEdges(diagram.edges, laidOutEdgeIds, positionedNodes, diagram.nodes, laidOutEdges, diagram.routing);
  const edgesById = new Map([...laidOutEdges, ...supplementalEdges].map((edge) => [edge.id, edge]));
  const edges = diagram.edges
    .filter((edge) => !isBoundaryEventId(diagram.nodes, edge.sourceId) && !isBoundaryEventId(diagram.nodes, edge.targetId))
    .map((edge) => edgesById.get(edge.id))
    .filter((edge): edge is RoutedEdge => Boolean(edge));

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
