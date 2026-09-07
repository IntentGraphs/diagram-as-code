import ELK from 'elkjs/lib/elk.bundled.js';
import { createSequentialRouter, facingSides, getRouteFallbackCount, outlineAnchor, rectsOverlap, segmentIntersectsRect, sidePort, type Point, type Rect } from '@bpm/diagram-core';
import { measureLabel, pointAlongPolyline, wrapLabel } from '@bpm/render-core';
import type { ArchitectureDiagram, ArchitectureEdge, ArchitectureNode } from './ast.js';
import type { DiagramDirection } from '@bpm/ast';
import { selectArchitectureView } from './views.js';

const elk = new ELK();
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.58;
const DETAIL_FONT_SIZE = 10;
const DETAIL_LINE_HEIGHT = DETAIL_FONT_SIZE * 1.25;
const DETAIL_MAX_LINES = 2;
const MIN_WIDTH = 120;
const MAX_WIDTH = 260;
const NODE_PADDING_X = 22;
const NODE_PADDING_Y = 18;
const CONTAINER_PADDING = 32;
const CONTAINER_TITLE_PADDING = 48;
const EDGE_LABEL_FONT_SIZE = 11;
const EDGE_LABEL_MAX_WIDTH = 240;
const EDGE_LABEL_GAP = 8;
const PARALLEL_EDGE_GAP = 18;

export interface PositionedArchitectureNode extends Rect { id: string; kind: ArchitectureNode['kind']; label: string; labelLines: string[]; description?: string; technology?: string; tags?: string[]; external?: boolean; group?: string; children: PositionedArchitectureNode[]; parentId?: string; }
export interface PositionedArchitectureEdge { id: string; sourceId: string; targetId: string; label?: string; displayLabel?: string; technology?: string; protocol?: string; tags?: string[]; points: Point[]; labelRect?: Rect; routeStatus?: 'clean' | 'fallback' | 'degraded'; labelPlacement?: 'clean' | 'fallback'; }
export interface PositionedArchitecture { nodes: PositionedArchitectureNode[]; edges: PositionedArchitectureEdge[]; width: number; height: number; direction?: DiagramDirection; title?: string; description?: string; viewKey?: string; viewType?: string; theme?: 'default' | 'high-contrast'; legend: boolean; }

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

function sizeNode(node: ArchitectureNode, includeDetails = true) {
  const labelLines = wrapLabel(node.label, MAX_WIDTH - NODE_PADDING_X, FONT_SIZE, node.kind === 'person' ? 2 : 5);
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(...labelLines.map((line) => line.length * CHAR_WIDTH), 0) + NODE_PADDING_X));
  const detail = includeDetails ? node.technology ?? node.description : undefined;
  const detailLines = detail ? wrapLabel(detail, MAX_WIDTH - NODE_PADDING_X, DETAIL_FONT_SIZE, DETAIL_MAX_LINES).length : 0;
  const footerHeight = 14 + (detailLines ? detailLines * DETAIL_LINE_HEIGHT + 4 : 0);
  const height = Math.max(node.kind === 'person' ? 92 : 68, labelLines.length * LINE_HEIGHT + NODE_PADDING_Y + footerHeight);
  return { node, labelLines, width, height };
}
const ELK_DIRECTIONS: Record<DiagramDirection, 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'> = { down: 'DOWN', up: 'UP', right: 'RIGHT', left: 'LEFT' };

function elkNode(node: ArchitectureNode, direction: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT', includeDetails = true): ElkArchitectureNode {
  const sized = sizeNode(node, includeDetails);
  const result: ElkArchitectureNode = { id: node.id, width: sized.width, height: sized.height };
  if (node.children.length) {
    result.layoutOptions = { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.padding': `[top=${CONTAINER_TITLE_PADDING},left=${CONTAINER_PADDING},bottom=${CONTAINER_PADDING},right=${CONTAINER_PADDING}]`, 'elk.spacing.nodeNode': '36', 'elk.layered.spacing.nodeNodeBetweenLayers': '56' };
    result.children = node.children.map((child) => elkNode(child, direction, includeDetails));
  }
  return result;
}
function flatten(nodes: PositionedArchitectureNode[], into: PositionedArchitectureNode[] = []): PositionedArchitectureNode[] { for (const node of nodes) { into.push(node); flatten(node.children, into); } return into; }
function absoluteNode(ast: ArchitectureNode, laid: ElkArchitectureNode, ox: number, oy: number, parentId?: string, includeDetails = true): PositionedArchitectureNode {
  const x = ox + (laid.x ?? 0), y = oy + (laid.y ?? 0), sized = sizeNode(ast, includeDetails);
  return { id: ast.id, kind: ast.kind, label: ast.label, labelLines: sized.labelLines, ...(ast.description ? { description: ast.description } : {}), ...(ast.technology ? { technology: ast.technology } : {}), ...(ast.tags ? { tags: ast.tags } : {}), ...(ast.external !== undefined ? { external: ast.external } : {}), ...(ast.group ? { group: ast.group } : {}), x, y, width: laid.width ?? sized.width, height: laid.height ?? sized.height, parentId, children: ast.children.map((child) => absoluteNode(child, (laid.children ?? []).find((entry) => entry.id === child.id) ?? { id: child.id }, x, y, ast.id, includeDetails)) };
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

function labelRectCollides(rect: Rect, nodes: PositionedArchitectureNode[], labels: Rect[], routes: Point[][]): boolean {
  const nodeCollision = nodes.some((node) => !node.children.length && rectsOverlap(rect, node));
  const labelCollision = labels.some((label) => rectsOverlap(rect, label));
  const routeCollision = routes.some((points) => points.some((point, index) => index > 0 && segmentIntersectsRect(points[index - 1], point, rect, 0, 0)));
  return nodeCollision || labelCollision || routeCollision;
}

function placeEdgeLabel(edge: PositionedArchitectureEdge, nodes: PositionedArchitectureNode[], labels: Rect[], routes: Point[][]): { rect: Rect; placement: 'clean' | 'fallback' } | undefined {
  const label = edge.displayLabel ?? edge.label;
  if (!label || edge.points.length < 2) return undefined;
  const candidates = labelRectCandidates(edge.points, label);
  const candidate = candidates.find((candidate) => !labelRectCollides(candidate, nodes, labels, routes));
  return candidate
    ? { rect: candidate, placement: 'clean' }
    : { rect: edgeLabelRect(pointAlongPolyline(edge.points, 0.5), label), placement: 'fallback' };
}

export async function layoutArchitecture(ast: ArchitectureDiagram, options?: { direction?: DiagramDirection; engineOverride?: string }): Promise<PositionedArchitecture> {
  const selected = selectArchitectureView(ast);
  const viewAst = selected.ast;
  const includeDetails = selected.view?.type !== 'systemLandscape';
  const direction = ELK_DIRECTIONS[options?.direction ?? selected.view?.direction ?? viewAst.direction ?? 'right'];
  const graph: ElkArchitectureGraph = { id: 'architecture', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.spacing.nodeNode': '48', 'elk.layered.spacing.nodeNodeBetweenLayers': '72' }, children: viewAst.nodes.map((node) => elkNode(node, direction, includeDetails)), edges: viewAst.edges.map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })) };
  const laid = await elk.layout(graph as never) as ElkArchitectureGraph;
  const nodes = viewAst.nodes.map((node) => absoluteNode(node, laid.children.find((entry) => entry.id === node.id) ?? { id: node.id }, 0, 0, undefined, includeDetails));
  const flat = flatten(nodes);
  const byId = new Map(flat.map((node) => [node.id, node]));
  const router = createSequentialRouter({ edgeObstaclePolicy: selected.view?.type === 'systemLandscape' ? 'none' : 'soft', readableEdgeGap: 16, shapeReadableGap: 12, experimental: true });
  const obstacles = flat.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const labelRects: Rect[] = [];
  const routedPaths: Point[][] = [];
  const viewEdges = allEdges(viewAst);
  const parallelGroups = new Map<string, PositionedArchitectureEdge['id'][]>();
  for (const edge of viewEdges) {
    const key = `${edge.sourceId}\u0000${edge.targetId}`;
    parallelGroups.set(key, [...(parallelGroups.get(key) ?? []), edge.id]);
  }
  const parallelIndexes = new Map<string, number>();
  for (const ids of parallelGroups.values()) ids.forEach((id, index) => parallelIndexes.set(id, index));

  const edges = viewEdges.flatMap((edge) => {
    const source = byId.get(edge.sourceId), target = byId.get(edge.targetId);
    if (!source || !target) return [];
    const sides = facingSides(source, target);
    const parallelIds = parallelGroups.get(`${edge.sourceId}\u0000${edge.targetId}`) ?? [edge.id];
    const parallelIndex = parallelIndexes.get(edge.id) ?? 0;
    const parallelOffset = (parallelIndex - (parallelIds.length - 1) / 2) * PARALLEL_EDGE_GAP;
    const start = parallelIds.length > 1
      ? sidePort(source, sides.from, parallelOffset)
      : outlineAnchor(source, sides.from, source.kind === 'database' ? 'rect' : 'rect', { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    const end = parallelIds.length > 1
      ? sidePort(target, sides.to, parallelOffset)
      : outlineAnchor(target, sides.to, target.kind === 'database' ? 'rect' : 'rect', { x: source.x + source.width / 2, y: source.y + source.height / 2 });
    const excluded = new Set([source.id, target.id, ...ancestorIds(source, byId), ...ancestorIds(target, byId)]);
    const routeObstacles = obstacles.filter((node) => !excluded.has(node.id));
    const fallbackCountBefore = getRouteFallbackCount();
    const points = router.route(start, end, routeObstacles, source.x === target.x ? 'vertical' : 'horizontal');
    const routeStatus = getRouteFallbackCount() > fallbackCountBefore ? 'fallback' as const : 'clean' as const;
    const displayLabel = [edge.label, edge.protocol ?? edge.technology].filter(Boolean).join(' · ');
    const positionedEdge: PositionedArchitectureEdge = { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, ...(edge.label === undefined ? {} : { label: edge.label }), ...(displayLabel ? { displayLabel } : {}), ...(edge.technology ? { technology: edge.technology } : {}), ...(edge.protocol ? { protocol: edge.protocol } : {}), ...(edge.tags ? { tags: edge.tags } : {}), points, routeStatus };
    if (positionedEdge.displayLabel) {
      const placedLabel = placeEdgeLabel(positionedEdge, flat, labelRects, routedPaths);
      if (placedLabel) {
        positionedEdge.labelPlacement = placedLabel.placement;
        if (placedLabel.placement === 'clean' || !selected.view) {
          positionedEdge.labelRect = placedLabel.rect;
          labelRects.push(placedLabel.rect);
        }
      }
    }
    routedPaths.push(points);
    return [positionedEdge];
  });
  const points = edges.flatMap((edge) => edge.points);
  const labelX = edges.flatMap((edge) => edge.labelRect ? [edge.labelRect.x + edge.labelRect.width] : []);
  const labelY = edges.flatMap((edge) => edge.labelRect ? [edge.labelRect.y + edge.labelRect.height] : []);
  const width = Math.max(1, laid.width ?? 0, ...flat.map((node) => node.x + node.width), ...points.map((point) => point.x), ...labelX);
  const height = Math.max(1, laid.height ?? 0, ...flat.map((node) => node.y + node.height), ...points.map((point) => point.y), ...labelY);
  return { nodes, edges, width, height, direction: options?.direction ?? selected.view?.direction ?? ast.direction ?? 'right', ...((selected.view?.title ?? ast.title) ? { title: selected.view?.title ?? ast.title } : {}), ...((selected.view?.description ?? ast.description) ? { description: selected.view?.description ?? ast.description } : {}), ...(selected.view?.key ? { viewKey: selected.view.key } : {}), ...(selected.view?.type ? { viewType: selected.view.type } : {}), theme: selected.view?.theme ?? ast.theme ?? 'default', legend: ast.legend !== false };
}
