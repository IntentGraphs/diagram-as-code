import {
  diagnosePaginatedScene,
  MIN_PAGE_SCALE,
  pageFitScale,
  pageSizeInPixels,
  type PaginatedScene,
  type PaginatedScenePage,
  type PageSpec,
  type SceneEdge,
  type SceneNode,
} from '@bpm/diagram-core';
import type { PageBreakStrategy } from '@bpm/ast';
import type { PositionedDiagram, PositionedLane, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout';

interface Group { pool: PositionedPool; lane?: PositionedLane; nodeIds: Set<string>; }

function flatten(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flatten(node.children, into);
  }
  return into;
}

function nodeScene(node: PositionedNode, parentId?: string): SceneNode {
  return { id: node.id, kind: node.kind, label: node.label, parentId, x: node.x, y: node.y, width: node.width, height: node.height };
}

function containerScene(value: PositionedPool | PositionedLane, kind: string, parentId?: string): SceneNode {
  return { id: value.id, kind, label: value.name, parentId, x: value.x, y: value.y, width: value.width, height: value.height };
}

function inside(node: PositionedNode, box: PositionedPool | PositionedLane): boolean {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
}

function groups(positioned: PositionedDiagram, breakStrategy?: PageBreakStrategy): Group[] {
  const nodes = flatten(positioned.nodes);
  const result: Group[] = [];
  for (const pool of positioned.pools) {
    const poolNodes = nodes.filter((node) => inside(node, pool));
    if (breakStrategy === 'lane' && pool.lanes.length > 0) {
      for (const lane of pool.lanes) {
        result.push({ pool, lane, nodeIds: new Set(poolNodes.filter((node) => inside(node, lane)).map((node) => node.id)) });
      }
    } else {
      result.push({ pool, nodeIds: new Set(poolNodes.map((node) => node.id)) });
    }
  }
  // A hand-positioned scene can contain nodes outside a positioned pool. Keep them in
  // the first semantic group rather than silently losing them.
  const claimed = new Set(result.flatMap((group) => [...group.nodeIds]));
  const unclaimed = nodes.filter((node) => !claimed.has(node.id));
  if (unclaimed.length) {
    const first = result[0];
    if (first) for (const node of unclaimed) first.nodeIds.add(node.id);
  }
  return result.length ? result : [{ pool: { id: 'diagram', name: '', x: 0, y: 0, width: positioned.nodes.length ? Math.max(...nodes.map((n) => n.x + n.width)) : 1, height: positioned.nodes.length ? Math.max(...nodes.map((n) => n.y + n.height)) : 1, lanes: [] }, nodeIds: new Set(nodes.map((node) => node.id)) }];
}

function bounds(nodes: SceneNode[], edges: SceneEdge[], containers: SceneNode[]): { x: number; y: number; width: number; height: number } {
  const values = [...nodes, ...containers];
  for (const edge of edges) for (const point of edge.points) values.push({ id: edge.id, kind: 'edge', x: point.x, y: point.y, width: 0, height: 0 });
  if (!values.length) return { x: 0, y: 0, width: 1, height: 1 };
  const minX = Math.min(...values.map((value) => value.x));
  const minY = Math.min(...values.map((value) => value.y));
  const maxX = Math.max(...values.map((value) => value.x + value.width));
  const maxY = Math.max(...values.map((value) => value.y + value.height));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function transformNode(node: SceneNode, source: ReturnType<typeof bounds>, scale: number, offsetX: number, offsetY: number): SceneNode {
  return { ...node, x: (node.x - source.x) * scale + offsetX, y: (node.y - source.y) * scale + offsetY, width: node.width * scale, height: node.height * scale };
}

function transformEdge(edge: SceneEdge, source: ReturnType<typeof bounds>, scale: number, offsetX: number, offsetY: number): SceneEdge {
  return { ...edge, points: edge.points.map((point) => ({ x: (point.x - source.x) * scale + offsetX, y: (point.y - source.y) * scale + offsetY })) };
}

function edgeScene(edge: RoutedEdge): SceneEdge {
  return { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, points: edge.points, label: edge.label, kind: edge.flowType, style: edge.style };
}

/** Builds complete semantic pages for BPMN without changing the established layout. */
export function paginateBpmn(positioned: PositionedDiagram, pageSpec?: PageSpec, pageBreak?: PageBreakStrategy): { scene: PaginatedScene; diagnostics: ReturnType<typeof diagnosePaginatedScene> } {
  const allNodes = flatten(positioned.nodes);
  const allEdges = positioned.edges.map(edgeScene);
  const groupsToPage = groups(positioned, pageBreak);
  const pageSize = pageSpec ? pageSizeInPixels(pageSpec) : undefined;
  const pages: PaginatedScenePage[] = [];
  const pageNodeIds: Set<string>[] = [];

  for (const group of groupsToPage) {
    const groupNodes = allNodes.filter((node) => group.nodeIds.has(node.id)).map((node) => nodeScene(node, group.lane?.id));
    const poolContainer = containerScene(group.pool, 'pool');
    const laneContainers = group.lane ? [containerScene(group.lane, 'lane', group.pool.id)] : group.pool.lanes.map((lane) => containerScene(lane, 'lane', group.pool.id));
    const containers = [poolContainer, ...laneContainers];
    const ids = new Set(groupNodes.map((node) => node.id));
    const pageEdges = allEdges.filter((edge) => ids.has(edge.sourceId) || ids.has(edge.targetId));
    // Cross-page routes can legitimately point toward another page. They must be
    // retained, but must not make the local semantic group appear impossibly wide.
    const sourceBounds = bounds(groupNodes, [], containers);
    const scale = pageSize ? pageFitScale(sourceBounds.width, sourceBounds.height, pageSpec!) : 1;
    const offsetX = pageSize ? Math.max(0, (pageSize.width - sourceBounds.width * scale) / 2) : 0;
    const offsetY = pageSize ? Math.max(0, (pageSize.height - sourceBounds.height * scale) / 2) : 0;
    const transformedNodes = groupNodes.map((node) => transformNode(node, sourceBounds, scale, offsetX, offsetY));
    const transformedContainers = containers.map((node) => transformNode(node, sourceBounds, scale, offsetX, offsetY));
    const transformedEdges = pageEdges.map((edge) => transformEdge(edge, sourceBounds, scale, offsetX, offsetY));
    const warnings = scale < MIN_PAGE_SCALE ? [`Page ${pages.length + 1} is below the recommended readability scale (${scale.toFixed(3)})`] : [];
    pages.push({ pageNumber: pages.length + 1, width: pageSize?.width ?? sourceBounds.width, height: pageSize?.height ?? sourceBounds.height, nodes: transformedNodes, edges: transformedEdges, containers: transformedContainers, sourcePoolId: group.pool.id, ...(group.lane ? { sourceLaneIds: [group.lane.id] } : {}), continuations: [], nodeCount: transformedNodes.length, edgeCount: transformedEdges.length, continuationCount: 0, readabilityScale: scale, warnings });
    pageNodeIds.push(ids);
  }

  for (const [index, ids] of pageNodeIds.entries()) {
    const page = pages[index];
    for (const edge of allEdges) {
      const sourcePage = pageNodeIds.findIndex((candidate) => candidate.has(edge.sourceId));
      const targetPage = pageNodeIds.findIndex((candidate) => candidate.has(edge.targetId));
      if (sourcePage < 0 || targetPage < 0 || sourcePage === targetPage || (!ids.has(edge.sourceId) && !ids.has(edge.targetId))) continue;
      page.continuations.push({ kind: 'both', sourcePage: sourcePage + 1, targetPage: targetPage + 1, nodeIds: [edge.sourceId, edge.targetId], edgeIds: [edge.id] });
    }
    page.continuationCount = page.continuations.length;
  }

  const scene: PaginatedScene = { mode: 'semantic', ...(pageSpec ? { pageSpec } : {}), sourceWidth: positioned.pools.length ? Math.max(...positioned.pools.map((pool) => pool.x + pool.width)) : Math.max(1, ...allNodes.map((node) => node.x + node.width)), sourceHeight: positioned.pools.length ? Math.max(...positioned.pools.map((pool) => pool.y + pool.height)) : Math.max(1, ...allNodes.map((node) => node.y + node.height)), pages };
  const diagnostics = diagnosePaginatedScene(scene);
  if (pageBreak === 'group' || pageBreak === 'branch') diagnostics.push({ code: 'pagination_unsupported_combination', severity: 'error', message: `pageBreak: ${pageBreak} is not supported for BPMN; use pageBreak: pool or pageBreak: lane` });
  if (pageSpec?.fit === 'strict') {
    for (const page of pages) if ((page.readabilityScale ?? 1) < MIN_PAGE_SCALE) diagnostics.push({ code: 'pagination_readability', severity: 'error', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} cannot meet the strict readability scale`, nodeIds: page.nodes.map((node) => node.id) });
  }
  return { scene, diagnostics };
}
