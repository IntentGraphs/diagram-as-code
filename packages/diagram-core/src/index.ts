export type { Point, Rect } from './geometry.js';
export {
  segmentIntersectsRect,
  inflateRect,
  rectsOverlap,
  segmentsIntersect,
  overshootsAnchor,
} from './geometry.js';

export type { Side, AnchorShape } from './anchors.js';
export { facingSides, sideOf, sidePort, outlinePort, stubFrom, outlineAnchor } from './anchors.js';

export type { Bounds } from './overlap.js';
export { describeOverlap, assertNoOverlaps } from './overlap.js';

export type { LayoutAnalysis, LayoutIssueCode, LayoutIssue } from './inspection.js';
export { issueDetailsFor, edgeLength, bendCount, isOrthogonal } from './inspection.js';
export {
  DEFAULT_PAGE_MARGIN_PX,
  MIN_PAGE_SCALE,
  fitGeometryToPage,
  fitSvgToPage,
  pageFitScale,
  pageSizeInches,
  pageSizeInPixels,
  parseFitDirective,
  parsePageDirective,
} from './page.js';
export type { FittedGeometry, FittedSvg, PageFit, PageGeometryEdge, PagePoint, PageRect, PageSpec, PageUnit } from './page.js';

export {
  normalizePaginatedScene,
  diagnosePaginatedScene,
} from './pagination.js';
export type {
  PaginationMode,
  PageBreakStrategy,
  PaginationOptions,
  SceneNode,
  SceneEdge,
  SceneInput,
  PageContinuation,
  PaginatedScenePage,
  PaginatedScene,
  PaginationDiagnosticCode,
  PaginationDiagnostic,
} from './pagination.js';

export { GANTT_TIMESCALES, normalizeGanttTimescale } from './timeline.js';
export type { GanttTimescale } from './timeline.js';

export type { VisibilityGraph } from './routing/visibilityGraph.js';
export { buildVisibilityGraph } from './routing/visibilityGraph.js';
export { shortestPath } from './routing/pathfind.js';
export type { RouteEdgeClass, RoutePenalty, RoutePenaltyWeights } from './routing/routeCost.js';
export {
  DEFAULT_READABLE_EDGE_GAP,
  DEFAULT_ROUTE_PENALTY_WEIGHTS,
  axisAlignedSegmentDistance,
  routeLength,
  routeBends,
  scoreRouteAgainstEdges,
  routePenaltyScore,
  simplifyRoute,
} from './routing/routeCost.js';
export type { EdgeObstaclePolicy, PreferredFirstTurn, SequentialRouteContext, SequentialRouter, SequentialRouterOptions } from './routing/router.js';
export {
  routeOrthogonal,
  routeOrthogonalFast,
  createSequentialRouter,
  getRouteFallbackCount,
  resetRouteFallbackCount,
} from './routing/router.js';
