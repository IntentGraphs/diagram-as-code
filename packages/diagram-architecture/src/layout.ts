import ELK from 'elkjs/lib/elk.bundled.js';
import { createSequentialRouter, facingSides, getRouteFallbackCount, outlineAnchor, rectsOverlap, segmentIntersectsRect, type Point, type Rect } from '@bpm/diagram-core';
import { measureLabel, pointAlongPolyline, wrapLabel } from '@bpm/render-core';
import type { ArchitectureDiagram, ArchitectureEdge, ArchitectureNode } from './ast.js';
import type { DiagramDirection } from '@bpm/ast';

const elk = new ELK();
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.58;
const MIN_WIDTH = 120;
const MAX_WIDTH = 260;
const NODE_PADDING_X = 22;
const NODE_PADDING_Y = 18;
const CONTAINER_PADDING = 32;
const CONTAINER_TITLE_PADDING = 48;
const EDGE_LABEL_FONT_SIZE = 11;
const EDGE_LABEL_MAX_WIDTH = 240;
const EDGE_LABEL_GAP = 8;

export interface PositionedArchitectureNode extends Rect { id: string; kind: ArchitectureNode['kind']; label: string; labelLines: string[]; children: PositionedArchitectureNode[]; parentId?: string; }
export interface PositionedArchitectureEdge { id: string; sourceId: string; targetId: string; label?: string; points: Point[]; labelRect?: Rect; routeStatus?: 'clean' | 'fallback' | 'degraded'; }
export interface PositionedArchitecture { nodes: PositionedArchitectureNode[]; edges: PositionedArchitectureEdge[]; width: number; height: number; }

interface ElkArchitectureNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkArchitectureNode[];
}

interface ElkArchitectureEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface ElkArchitectureGraph extends ElkArchitectureNode {
  children: ElkArchitectureNode[];
  edges: ElkArchitectureEdge[];
}

function sizeNode(node: ArchitectureNode) {
  const labelLines = wrapLabel(node.label, MAX_WIDTH - NODE_PADDING_X, FONT_SIZE, 5);
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(...labelLines.map((line) => line.length * CHAR_WIDTH), 0) + NODE_PADDING_X));
  const height = Math.max(52, labelLines.length * LINE_HEIGHT + NODE_PADDING_Y);
  return { node, labelLines, width, height };
}
const ELK_DIRECTIONS: Record<DiagramDirection, 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'> = { down: 'DOWN', up: 'UP', right: 'RIGHT', left: 'LEFT' };

function elkNode(node: ArchitectureNode, direction: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'): ElkArchitectureNode {
  const sized = sizeNode(node);
  const result: ElkArchitectureNode = { id: node.id, width: sized.width, height: sized.height };
  if (node.children.length) {
    result.layoutOptions = { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.padding': `[top=${CONTAINER_TITLE_PADDING},left=${CONTAINER_PADDING},bottom=${CONTAINER_PADDING},right=${CONTAINER_PADDING}]`, 'elk.spacing.nodeNode': '36', 'elk.layered.spacing.nodeNodeBetweenLayers': '56' };
    result.children = node.children.map((child) => elkNode(child, direction));
  }
  return result;
}
function flatten(nodes: PositionedArchitectureNode[], into: PositionedArchitectureNode[] = []): PositionedArchitectureNode[] { for (const node of nodes) { into.push(node); flatten(node.children, into); } return into; }
function absoluteNode(ast: ArchitectureNode, laid: ElkArchitectureNode, ox: number, oy: number, parentId?: string): PositionedArchitectureNode {
  const x = ox + (laid.x ?? 0), y = oy + (laid.y ?? 0), sized = sizeNode(ast);
  return { id: ast.id, kind: ast.kind, label: ast.label, labelLines: sized.labelLines, x, y, width: laid.width ?? sized.width, height: laid.height ?? sized.height, parentId, children: ast.children.map((child) => absoluteNode(child, (laid.children ?? []).find((entry) => entry.id === child.id) ?? { id: child.id }, x, y, ast.id)) };
}
function allEdges(ast: ArchitectureDiagram): ArchitectureEdge[] { return ast.edges; }

function ancestorIds(node: PositionedArchitectureNode | undefined, byId: Map<string, PositionedArchitectureNode>): Set<string> {
  const result = new Set<string>();
  let current = node?.parentId;
  while (current) {
    result.add(current);
    current = byId.get(current)?.parentId;
  }
  return result;
}

function edgeLabelRect(center: Point, label: string): Rect {
  const metrics = measureLabel(label, EDGE_LABEL_MAX_WIDTH, EDGE_LABEL_FONT_SIZE, 3);
  const width = Math.max(32, metrics.width + EDGE_LABEL_GAP * 2);
  const height = metrics.height + EDGE_LABEL_GAP;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

function labelRectCandidates(points: Point[], label: string): Rect[] {
  const metrics = measureLabel(label, EDGE_LABEL_MAX_WIDTH, EDGE_LABEL_FONT_SIZE, 3);
  const offsets = [metrics.height / 2 + EDGE_LABEL_GAP, -(metrics.height / 2 + EDGE_LABEL_GAP)];
  const candidates: Rect[] = [];
  for (const fraction of [0.5, 0.34, 0.66, 0.2, 0.8]) {
    const center = pointAlongPolyline(points, fraction);
    let horizontal = true;
    let bestDistance = Infinity;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1], b = points[index];
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      const distance = Math.max(minX - center.x, 0, center.x - maxX) + Math.max(minY - center.y, 0, center.y - maxY);
      if (distance < bestDistance) {
        bestDistance = distance;
        horizontal = a.y === b.y;
      }
    }
    for (const offset of offsets) {
      candidates.push(edgeLabelRect({ x: center.x, y: center.y + (horizontal ? offset : 0) }, label));
      candidates.push(edgeLabelRect({ x: center.x + (horizontal ? 0 : offset), y: center.y }, label));
    }
  }
  return candidates;
}

function labelRectCollides(rect: Rect, nodes: PositionedArchitectureNode[], labels: Rect[], routes: Point[][], edge: PositionedArchitectureEdge): boolean {
  const nodeCollision = nodes.some((node) => node.id !== edge.sourceId && node.id !== edge.targetId && !node.children.length && rectsOverlap(rect, node));
  const labelCollision = labels.some((label) => rectsOverlap(rect, label));
  const routeCollision = routes.some((points) => points.some((point, index) => index > 0 && segmentIntersectsRect(points[index - 1], point, rect, 0, 0)));
  return nodeCollision || labelCollision || routeCollision;
}

function placeEdgeLabel(edge: PositionedArchitectureEdge, nodes: PositionedArchitectureNode[], labels: Rect[], routes: Point[][]): Rect | undefined {
  if (!edge.label || edge.points.length < 2) return undefined;
  const candidates = labelRectCandidates(edge.points, edge.label);
  return candidates.find((candidate) => !labelRectCollides(candidate, nodes, labels, routes, edge))
    ?? edgeLabelRect(pointAlongPolyline(edge.points, 0.5), edge.label);
}

export async function layoutArchitecture(ast: ArchitectureDiagram, options?: { direction?: DiagramDirection; engineOverride?: string }): Promise<PositionedArchitecture> {
  const direction = ELK_DIRECTIONS[options?.direction ?? ast.direction ?? 'right'];
  const graph: ElkArchitectureGraph = { id: 'architecture', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.spacing.nodeNode': '48', 'elk.layered.spacing.nodeNodeBetweenLayers': '72' }, children: ast.nodes.map((node) => elkNode(node, direction)), edges: ast.edges.map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })) };
  const laid = await elk.layout(graph as never) as ElkArchitectureGraph;
  const nodes = ast.nodes.map((node) => absoluteNode(node, laid.children.find((entry) => entry.id === node.id) ?? { id: node.id }, 0, 0));
  const flat = flatten(nodes);
  const byId = new Map(flat.map((node) => [node.id, node]));
  const router = createSequentialRouter({ edgeObstaclePolicy: 'soft', readableEdgeGap: 16, shapeReadableGap: 12, experimental: true });
  const obstacles = flat.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const labelRects: Rect[] = [];
  const routedPaths: Point[][] = [];
  const edges = allEdges(ast).flatMap((edge) => {
    const source = byId.get(edge.sourceId), target = byId.get(edge.targetId);
    if (!source || !target) return [];
    const sides = facingSides(source, target);
    const start = outlineAnchor(source, sides.from, source.kind === 'database' ? 'rect' : 'rect', { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    const end = outlineAnchor(target, sides.to, target.kind === 'database' ? 'rect' : 'rect', { x: source.x + source.width / 2, y: source.y + source.height / 2 });
    const excluded = new Set([source.id, target.id, ...ancestorIds(source, byId), ...ancestorIds(target, byId)]);
    const routeObstacles = obstacles.filter((node) => !excluded.has(node.id));
    const fallbackCountBefore = getRouteFallbackCount();
    const points = router.route(start, end, routeObstacles);
    const routeStatus = getRouteFallbackCount() > fallbackCountBefore ? 'fallback' as const : 'clean' as const;
    const positionedEdge: PositionedArchitectureEdge = { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, ...(edge.label === undefined ? {} : { label: edge.label }), points, routeStatus };
    if (positionedEdge.label) {
      positionedEdge.labelRect = placeEdgeLabel(positionedEdge, flat, labelRects, routedPaths);
      if (positionedEdge.labelRect) labelRects.push(positionedEdge.labelRect);
    }
    routedPaths.push(points);
    return [positionedEdge];
  });
  const points = edges.flatMap((edge) => edge.points);
  const width = Math.max(1, laid.width ?? 0, ...flat.map((node) => node.x + node.width), ...points.map((point) => point.x));
  const height = Math.max(1, laid.height ?? 0, ...flat.map((node) => node.y + node.height), ...points.map((point) => point.y));
  return { nodes, edges, width, height };
}
