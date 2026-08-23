import { pageSizeInPixels, type PageRect, type PageSpec } from './page.js';

export type PaginationMode = 'none' | 'semantic' | 'tile' | 'hybrid';
export type PageBreakStrategy = 'pool' | 'lane' | 'group' | 'branch';

export interface PaginationOptions {
  mode: PaginationMode;
  pageBreak?: PageBreakStrategy;
}

export interface SceneNode extends PageRect {
  id: string;
  kind: string;
  label?: string;
  parentId?: string;
}

export interface SceneEdge {
  id: string;
  sourceId: string;
  targetId: string;
  points: Array<{ x: number; y: number }>;
  label?: string;
  /** Family-neutral edge semantics retained by semantic paginators. */
  kind?: string;
  style?: string;
}

export interface SceneInput {
  width: number;
  height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  title?: string;
}

export interface PageContinuation {
  kind: 'node' | 'edge' | 'both';
  sourcePage: number;
  targetPage: number;
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface PaginatedScenePage {
  pageNumber: number;
  width: number;
  height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  title?: string;
  continuations: PageContinuation[];
  /** Optional semantic containers (for BPMN these are the pool and lane bounds). */
  containers?: SceneNode[];
  sourcePoolId?: string;
  sourceLaneIds?: string[];
  nodeCount?: number;
  edgeCount?: number;
  continuationCount?: number;
  readabilityScale?: number;
  warnings?: string[];
}

/** Stable, exporter-neutral representation consumed by all multi-page exporters. */
export interface PaginatedScene {
  mode: PaginationMode;
  pageSpec?: PageSpec;
  sourceWidth: number;
  sourceHeight: number;
  pages: PaginatedScenePage[];
}

export type PaginationDiagnosticCode =
  | 'pagination_page_count'
  | 'pagination_page_bounds'
  | 'pagination_cross_page_edge'
  | 'pagination_readability'
  | 'pagination_unsupported_combination'
  | 'pagination_impossible_geometry'
  | 'pagination_duplicate_id'
  | 'pagination_invalid_reference'
  | 'pagination_metadata_count';

export interface PaginationDiagnostic {
  code: PaginationDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  pageNumber?: number;
  nodeIds?: string[];
  edgeIds?: string[];
}

/** Normalizes a positioned scene without deciding how a family should split it. */
export function normalizePaginatedScene(scene: SceneInput, options: PaginationOptions = { mode: 'none' }, pageSpec?: PageSpec): PaginatedScene {
  const dimensions = pageSpec ? pageSizeInPixels(pageSpec) : { width: scene.width, height: scene.height };
  return {
    mode: options.mode,
    ...(pageSpec ? { pageSpec } : {}),
    sourceWidth: scene.width,
    sourceHeight: scene.height,
    pages: [{
      pageNumber: 1,
      width: dimensions.width,
      height: dimensions.height,
      nodes: scene.nodes,
      edges: scene.edges,
      ...(scene.title ? { title: scene.title } : {}),
      continuations: [],
    }],
  };
}

function finite(value: number): boolean { return Number.isFinite(value); }

function sameIds(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function validIds(ids: string[] | undefined): ids is string[] {
  return !!ids?.length && ids.every((id) => id.length > 0) && new Set(ids).size === ids.length;
}

/** Checks the shared contract; readability is advisory, geometry/capability errors are not. */
export function diagnosePaginatedScene(scene: PaginatedScene, minReadableScale = 0.25): PaginationDiagnostic[] {
  const diagnostics: PaginationDiagnostic[] = [];
  if (!finite(scene.sourceWidth) || scene.sourceWidth <= 0 || !finite(scene.sourceHeight) || scene.sourceHeight <= 0) {
    diagnostics.push({ code: 'pagination_impossible_geometry', severity: 'error', message: 'Paginated scene source dimensions must be finite and positive' });
  }
  if (scene.pages.length === 0) {
    diagnostics.push({ code: 'pagination_page_count', severity: 'error', message: 'Paginated scene must contain at least one page' });
    return diagnostics;
  }
  const pageNumbers = scene.pages.map((page) => page.pageNumber);
  if (pageNumbers.some((number, index) => number !== index + 1)) {
    diagnostics.push({ code: 'pagination_page_count', severity: 'error', message: 'Page numbers must be stable, contiguous, and start at 1' });
  }
  const pagesByNumber = new Map(scene.pages.map((page) => [page.pageNumber, page]));
  const idsByPage = new Map(scene.pages.map((page) => [page.pageNumber, new Set([...page.nodes, ...(page.containers ?? [])].map((item) => item.id))]));

  const validContinuation = (page: PaginatedScenePage, continuation: PageContinuation): boolean => {
    const sourcePage = pagesByNumber.get(continuation.sourcePage);
    const targetPage = pagesByNumber.get(continuation.targetPage);
    if (!sourcePage || !targetPage || sourcePage === targetPage || (page !== sourcePage && page !== targetPage)) return false;

    const needsNodes = continuation.kind === 'node' || continuation.kind === 'both';
    const needsEdges = continuation.kind === 'edge' || continuation.kind === 'both';
    if ((needsNodes && !validIds(continuation.nodeIds)) || (needsEdges && !validIds(continuation.edgeIds))) return false;
    if (continuation.nodeIds && (!validIds(continuation.nodeIds) || continuation.nodeIds.some((id) => !idsByPage.get(sourcePage.pageNumber)?.has(id) && !idsByPage.get(targetPage.pageNumber)?.has(id)))) return false;
    if (continuation.edgeIds && !validIds(continuation.edgeIds)) return false;

    const counterpartPage = page === sourcePage ? targetPage : sourcePage;
    const counterpart = counterpartPage.continuations.some((candidate) =>
      candidate.kind === continuation.kind
      && candidate.sourcePage === continuation.sourcePage
      && candidate.targetPage === continuation.targetPage
      && sameIds(candidate.nodeIds, continuation.nodeIds)
      && sameIds(candidate.edgeIds, continuation.edgeIds));
    if (!counterpart) return false;

    for (const edgeId of continuation.edgeIds ?? []) {
      const sourceEdges = sourcePage.edges.filter((edge) => edge.id === edgeId);
      const targetEdges = targetPage.edges.filter((edge) => edge.id === edgeId);
      if (sourceEdges.length !== 1 || targetEdges.length !== 1) return false;
      const sourceEdge = sourceEdges[0];
      const targetEdge = targetEdges[0];
      if (sourceEdge.sourceId !== targetEdge.sourceId || sourceEdge.targetId !== targetEdge.targetId) return false;
      if (!idsByPage.get(sourcePage.pageNumber)?.has(sourceEdge.sourceId) || !idsByPage.get(targetPage.pageNumber)?.has(sourceEdge.targetId)) return false;
      if (needsNodes && (!continuation.nodeIds?.includes(sourceEdge.sourceId) || !continuation.nodeIds.includes(sourceEdge.targetId))) return false;

      const localEdge = page === sourcePage ? sourceEdge : targetEdge;
      const localIds = idsByPage.get(page.pageNumber)!;
      if (Number(localIds.has(localEdge.sourceId)) + Number(localIds.has(localEdge.targetId)) !== 1) return false;
      if (localEdge.points.length < 2 || localEdge.points.some((point) => !finite(point.x) || !finite(point.y))) return false;
      if (!localEdge.points.some((point) => point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height)) return false;
    }
    return true;
  };
  for (const page of scene.pages) {
    if (!(page.width > 0) || !(page.height > 0) || !finite(page.width) || !finite(page.height)) {
      diagnostics.push({ code: 'pagination_impossible_geometry', severity: 'error', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} has impossible dimensions` });
      continue;
    }
    const allIds = [...page.nodes, ...(page.containers ?? [])].map((item) => item.id);
    const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
    if (duplicateIds.length) diagnostics.push({ code: 'pagination_duplicate_id', severity: 'error', pageNumber: page.pageNumber, nodeIds: [...new Set(duplicateIds)], message: `Page ${page.pageNumber} contains duplicate node or container IDs` });
    const outOfBoundsNodes = [...page.nodes, ...(page.containers ?? [])].filter((node) => !finite(node.x) || !finite(node.y) || !finite(node.width) || !finite(node.height) || node.width < 0 || node.height < 0 || node.x < 0 || node.y < 0 || node.x + node.width > page.width || node.y + node.height > page.height).map((node) => node.id);
    if (outOfBoundsNodes.length) diagnostics.push({ code: 'pagination_page_bounds', severity: 'error', pageNumber: page.pageNumber, nodeIds: outOfBoundsNodes, message: `Page ${page.pageNumber} contains geometry outside its bounds` });
    const scale = Math.min(page.width / Math.max(scene.sourceWidth, 1), page.height / Math.max(scene.sourceHeight, 1));
    if (scene.mode !== 'none' && scale < minReadableScale) diagnostics.push({ code: 'pagination_readability', severity: 'warning', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} may be difficult to read at scale ${scale.toFixed(3)}` });
    const ids = new Set(allIds);
    const validContinuations = page.continuations.filter((continuation) => validContinuation(page, continuation));
    const continuedEdgeIds = new Set(validContinuations.flatMap((continuation) => continuation.edgeIds ?? []));
    const invalidEdges = page.edges.filter((edge) => {
      const continued = continuedEdgeIds.has(edge.id);
      const invalidEndpoints = !ids.has(edge.sourceId) || !ids.has(edge.targetId);
      const invalidPoints = edge.points.length < 2 || edge.points.some((point) => !finite(point.x) || !finite(point.y));
      const outOfBoundsPoints = edge.points.some((point) => point.x < 0 || point.y < 0 || point.x > page.width || point.y > page.height);
      return invalidPoints || (!continued && (invalidEndpoints || outOfBoundsPoints));
    }).map((edge) => edge.id);
    if (invalidEdges.length) diagnostics.push({ code: 'pagination_page_bounds', severity: 'error', pageNumber: page.pageNumber, edgeIds: invalidEdges, message: `Page ${page.pageNumber} contains invalid edge references or geometry` });
    if (page.nodeCount !== undefined && page.nodeCount !== page.nodes.length) diagnostics.push({ code: 'pagination_metadata_count', severity: 'error', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} nodeCount does not match its nodes` });
    if (page.edgeCount !== undefined && page.edgeCount !== page.edges.length) diagnostics.push({ code: 'pagination_metadata_count', severity: 'error', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} edgeCount does not match its edges` });
    if (page.continuationCount !== undefined && page.continuationCount !== page.continuations.length) diagnostics.push({ code: 'pagination_metadata_count', severity: 'error', pageNumber: page.pageNumber, message: `Page ${page.pageNumber} continuationCount does not match its continuations` });
    for (const continuation of page.continuations) {
      if (!validContinuation(page, continuation)) {
        diagnostics.push({ code: 'pagination_invalid_reference', severity: 'error', pageNumber: page.pageNumber, edgeIds: continuation.edgeIds, nodeIds: continuation.nodeIds, message: `Page ${page.pageNumber} contains an invalid or unmatched continuation` });
        continue;
      }
      if (continuation.sourcePage !== page.pageNumber || continuation.targetPage === page.pageNumber) continue;
      diagnostics.push({ code: 'pagination_cross_page_edge', severity: 'warning', pageNumber: page.pageNumber, edgeIds: continuation.edgeIds, nodeIds: continuation.nodeIds, message: `Page ${page.pageNumber} continues content on page ${continuation.targetPage}` });
    }
  }
  return diagnostics;
}
