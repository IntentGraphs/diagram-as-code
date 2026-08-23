import type { PositionedDiagram, PositionedNode, RoutedEdge } from './types.js';
import { analyzeLayout, type LayoutAnalysis } from './geometry.js';
import {
  issueDetailsFor as genericIssueDetailsFor,
  edgeLength as genericEdgeLength,
  bendCount as genericBendCount,
  isOrthogonal as genericIsOrthogonal,
  type LayoutIssue,
} from '@bpm/diagram-core';

export type { LayoutIssue, LayoutIssueCode } from '@bpm/diagram-core';

export interface InspectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InspectedNode extends InspectionRect {
  id: string;
  kind: PositionedNode['kind'];
  label: string;
  parentId?: string;
  attachedToId?: string;
}

export interface InspectedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  flowType: RoutedEdge['flowType'];
  points: Array<{ x: number; y: number }>;
  length: number;
  bendCount: number;
  orthogonal: boolean;
  explicitWaypoints: boolean;
}

export interface LayoutInspection {
  /** Absolute positioned node geometry, including nested subprocess children. */
  nodes: InspectedNode[];
  /** Resolved edge paths, including nested subprocess edges. */
  edges: InspectedEdge[];
  /** Content bounds derived from shapes, pools, and resolved edge points. */
  contentBounds: InspectionRect;
  /** Renderer-like bounds using the current 40px outer margin. */
  renderBounds: InspectionRect;
  metrics: {
    edgeCrossings: number;
    nodeOverlaps: number;
    edgeThroughNode: number;
    edgeOvershootsOwnEndpoint: number;
    routeFallbacks: number;
  };
  issues: Pick<LayoutAnalysis, 'nodeOverlaps' | 'edgeThroughNode' | 'edgeOvershootsOwnEndpoint'>;
  issueDetails: LayoutIssue[];
}

function flattenNodes(
  nodes: PositionedNode[],
  parentId?: string,
  into: InspectedNode[] = [],
): InspectedNode[] {
  for (const node of nodes) {
    into.push({
      id: node.id,
      kind: node.kind,
      label: node.label,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      ...(parentId ? { parentId } : {}),
      ...('attachedToId' in node && node.attachedToId ? { attachedToId: node.attachedToId } : {}),
    });
    if (node.children) flattenNodes(node.children, node.id, into);
  }
  return into;
}

function flattenEdges(
  nodes: PositionedNode[],
  topEdges: RoutedEdge[],
  into: RoutedEdge[] = [],
): RoutedEdge[] {
  into.push(...topEdges);
  for (const node of nodes) {
    if (node.childEdges) into.push(...node.childEdges);
    if (node.children) flattenEdges(node.children, [], into);
  }
  return into;
}

function boundsFor(positioned: PositionedDiagram, nodes: InspectedNode[], edges: InspectedEdge[]): InspectionRect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const node of nodes) {
    xs.push(node.x, node.x + node.width);
    ys.push(node.y, node.y + node.height);
  }
  for (const pool of positioned.pools) {
    xs.push(pool.x, pool.x + pool.width);
    ys.push(pool.y, pool.y + pool.height);
  }
  for (const edge of edges) {
    for (const point of edge.points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 40;
  const maxY = ys.length > 0 ? Math.max(...ys) : 40;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/**
 * Produce the absolute geometry and deterministic quality metrics an AI or CLI consumer needs
 * after layout. This deliberately exposes resolved routes instead of requiring a model to
 * simulate ELK or the visibility-graph router from source text.
 */
export function inspectLayout(positioned: PositionedDiagram, routeFallbacks = 0): LayoutInspection {
  const analysis = analyzeLayout(positioned);
  const nodes = flattenNodes(positioned.nodes);
  const edges = flattenEdges(positioned.nodes, positioned.edges).map((edge) => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    flowType: edge.flowType,
    points: edge.points,
    length: genericEdgeLength(edge.points),
    bendCount: genericBendCount(edge.points),
    orthogonal: genericIsOrthogonal(edge.points),
    explicitWaypoints: Boolean(edge.waypoints?.length),
  }));
  const contentBounds = boundsFor(positioned, nodes, edges);
  const maxX = Math.max(40, contentBounds.x + contentBounds.width) + 40;
  const maxY = Math.max(40, contentBounds.y + contentBounds.height) + 40;

  return {
    nodes,
    edges,
    contentBounds,
    renderBounds: { x: 0, y: 0, width: maxX, height: maxY },
    metrics: {
      edgeCrossings: analysis.edgeCrossings,
      nodeOverlaps: analysis.nodeOverlaps.length,
      edgeThroughNode: analysis.edgeThroughNode.length,
      edgeOvershootsOwnEndpoint: analysis.edgeOvershootsOwnEndpoint.length,
      routeFallbacks,
    },
    issues: {
      nodeOverlaps: analysis.nodeOverlaps,
      edgeThroughNode: analysis.edgeThroughNode,
      edgeOvershootsOwnEndpoint: analysis.edgeOvershootsOwnEndpoint,
    },
    issueDetails: genericIssueDetailsFor(analysis),
  };
}
