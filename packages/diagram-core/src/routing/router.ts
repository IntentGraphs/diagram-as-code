import type { Point, Rect } from '../geometry.js';
import { inflateRect, segmentIntersectsRect } from '../geometry.js';
import { buildVisibilityGraph } from './visibilityGraph.js';
import { shortestPath } from './pathfind.js';
import { routePenaltyScore, scoreRouteAgainstEdges, simplifyRoute, type RouteEdgeClass } from './routeCost.js';

const DEFAULT_CLEARANCE = 10;
const EDGE_OBSTACLE_THICKNESS = 4;

/**
 * Finds the shortest orthogonal (Manhattan) path from `start` to `end` that clears every
 * obstacle by `clearance` pixels. Obstacles must already exclude the edge's own source and
 * target nodes (a path has to touch its own endpoints' nodes, so those can't be obstacles).
 * Falls back to a 2-segment L-corner (still Manhattan; may clip a node) if no clear path
 * exists at any retry — the caller must never crash on it.
 */
// Tried in order at the caller's requested clearance, then progressively looser, before
// giving up. A silent diagonal fallback is worse than a legal path with less breathing room
// around obstacles — this is what resolves crowded-boundary and nested-container cases a
// single fixed clearance regresses.
const CLEARANCE_LADDER = [DEFAULT_CLEARANCE, 6, 4, 2, 0];

let routeFallbackCount = 0;
export interface RouteFallbackDetail {
  start: Point;
  end: Point;
  obstacleCount: number;
  requestedClearance: number;
  fallback: 'l-corner';
}

export type PreferredFirstTurn = 'horizontal' | 'vertical';

export type EdgeObstaclePolicy = 'hard' | 'soft' | 'none';

export interface SequentialRouterOptions {
  /**
   * How previously routed edges participate in later route selection. Shape
   * obstacles remain hard in both modes. The soft mode only accepts a direct
   * shape-safe alternative when the hard edge-avoidance route is a severe
   * detour.
   * `none` skips accumulated edge obstacles entirely. Node/shape obstacles
   * remain hard, making this an explicit fast mode that may produce crossings.
   */
  edgeObstaclePolicy?: EdgeObstaclePolicy;
  readableEdgeGap?: number;
  shapeReadableGap?: number;
  tinyJogThreshold?: number;
}

export interface SequentialRouteContext {
  edgeClass?: RouteEdgeClass;
  readableEdgeGap?: number;
  shapeReadableGap?: number;
  tinyJogThreshold?: number;
}

const routeFallbackDetails: RouteFallbackDetail[] = [];

/** How many times routeOrthogonal has fallen back because no Manhattan path was found. */
export function getRouteFallbackCount(): number {
  return routeFallbackCount;
}

export function resetRouteFallbackCount(): void {
  routeFallbackCount = 0;
  routeFallbackDetails.length = 0;
}

/** Returns structured fallback information without exposing mutable internal state. */
export function getRouteFallbackDetails(): RouteFallbackDetail[] {
  return routeFallbackDetails.map((detail) => ({ ...detail, start: { ...detail.start }, end: { ...detail.end } }));
}

function clearanceAttempts(requested: number): number[] {
  const looser = CLEARANCE_LADDER.filter((c) => c < requested);
  return [...new Set([requested, ...looser])];
}

/**
 * The two L-corners `buildVisibilityGraph` always seeds (horizontal-first and
 * vertical-first). Used when every clearance retry fails: a right-angle that may
 * clip a node is still preferable to a raw unclamped diagonal.
 */
function orthogonalLFallback(start: Point, end: Point, obstacles: Rect[]): Point[] {
  if (start.x === end.x || start.y === end.y) return [start, end];
  const cornerH = { x: end.x, y: start.y };
  const cornerV = { x: start.x, y: end.y };
  const hits = (a: Point, b: Point) =>
    obstacles.filter((rect) => segmentIntersectsRect(a, b, rect, 0, 0)).length;
  const hScore = hits(start, cornerH) + hits(cornerH, end);
  const vScore = hits(start, cornerV) + hits(cornerV, end);
  const corner = vScore < hScore ? cornerV : cornerH;
  return [start, corner, end];
}

/**
 * Bounded-cost degraded route used by explicit fast layout profiles. It tests the two
 * direct Manhattan candidates once and chooses a shape-clear candidate when available.
 * If both candidates touch shapes, it returns the one with fewer intersections rather
 * than constructing a visibility graph. Callers must surface the resulting crossings
 * or clearance defects through normal layout inspection.
 */
export function routeOrthogonalFast(
  start: Point,
  end: Point,
  obstacles: Rect[],
  preferredFirstTurn?: PreferredFirstTurn,
): Point[] {
  if (start.x === end.x || start.y === end.y) return [start, end];
  const cornerH = { x: end.x, y: start.y };
  const cornerV = { x: start.x, y: end.y };
  const candidates = preferredFirstTurn === 'vertical'
    ? [[start, cornerV, end], [start, cornerH, end]]
    : [[start, cornerH, end], [start, cornerV, end]];
  const inflated = obstacles.map((rect) => inflateRect(rect, DEFAULT_CLEARANCE));
  const score = (path: Point[]) => inflated.reduce((total, rect) => total + path.slice(0, -1).reduce(
    (segments, _, index) => segments + (segmentIntersectsRect(path[index], path[index + 1], rect, 0, 0) ? 1 : 0),
    0,
  ), 0);
  const scores = candidates.map(score);
  return candidates[scores[0] <= scores[1] ? 0 : 1];
}

export function routeOrthogonal(
  start: Point,
  end: Point,
  obstacles: Rect[],
  clearance = DEFAULT_CLEARANCE,
  preferredFirstTurn?: PreferredFirstTurn,
): Point[] {
  if (start.x === end.x && start.y === end.y) return [start, end];
  for (const c of clearanceAttempts(clearance)) {
    const inflated = obstacles.map((rect) => inflateRect(rect, c));
    if (preferredFirstTurn) {
      const corner = preferredFirstTurn === 'vertical'
        ? { x: start.x, y: end.y }
        : { x: end.x, y: start.y };
      const clear = inflated.every((rect) =>
        !segmentIntersectsRect(start, corner, rect, 0, 0) &&
        !segmentIntersectsRect(corner, end, rect, 0, 0));
      if (clear) return [start, corner, end];
    }
    const graph = buildVisibilityGraph(start, end, inflated);
    const path = shortestPath(graph, 0, 1);
    if (path) return path.map((index) => graph.points[index]);
  }
  routeFallbackCount += 1;
  routeFallbackDetails.push({
    start: { ...start },
    end: { ...end },
    obstacleCount: obstacles.length,
    requestedClearance: clearance,
    fallback: 'l-corner',
  });
  if (typeof process === 'undefined' || !process.env?.VITEST) {
    console.warn(
      `[bpm/diagram-core] routeOrthogonal fallback #${routeFallbackCount}: no Manhattan path, using L-corner (${start.x},${start.y})→(${end.x},${end.y})`,
    );
  }
  return orthogonalLFallback(start, end, obstacles);
}

function segmentToThinRect(p1: Point, p2: Point, thickness: number): Rect {
  return {
    x: Math.min(p1.x, p2.x) - thickness / 2,
    y: Math.min(p1.y, p2.y) - thickness / 2,
    width: Math.abs(p2.x - p1.x) + thickness,
    height: Math.abs(p2.y - p1.y) + thickness,
  };
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return length;
}

function pathBends(points: Point[]): number {
  let bends = 0;
  let previous: 'horizontal' | 'vertical' | undefined;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    if (dx === 0 && dy === 0) continue;
    const direction = dx === 0 ? 'vertical' : 'horizontal';
    if (previous && previous !== direction) bends += 1;
    previous = direction;
  }
  return bends;
}

/**
 * Return the preferred direct L-path when its two segments clear all shape
 * obstacles at normal clearance. This candidate intentionally ignores prior
 * edge paths; the caller only considers it when the hard edge-avoidance route
 * is disproportionately longer and more complex.
 */
function shapeSafePreferredPath(
  start: Point,
  end: Point,
  obstacles: Rect[],
  preferredFirstTurn?: PreferredFirstTurn,
): Point[] | undefined {
  if (!preferredFirstTurn) return undefined;
  const corner = preferredFirstTurn === 'vertical'
    ? { x: start.x, y: end.y }
    : { x: end.x, y: start.y };
  const isDegenerate = (corner.x === start.x && corner.y === start.y) || (corner.x === end.x && corner.y === end.y);
  if (isDegenerate) {
    return [start, end];
  }
  const inflated = obstacles.map((rect) => inflateRect(rect, DEFAULT_CLEARANCE));
  const clear = inflated.every((rect) =>
    !segmentIntersectsRect(start, corner, rect, 0, 0) &&
    !segmentIntersectsRect(corner, end, rect, 0, 0));
  return clear ? [start, corner, end] : undefined;
}

function shouldPreferSoftPath(hardPath: Point[], softPath: Point[]): boolean {
  const hardLength = pathLength(hardPath);
  const softLength = pathLength(softPath);
  const hardBends = pathBends(hardPath);
  const softBends = pathBends(softPath);
  return hardLength >= softLength * 1.75 || hardBends >= softBends + 4;
}

function distinctPaths(paths: Array<Point[] | undefined>): Point[][] {
  const result: Point[][] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!path) continue;
    const key = path.map((point) => `${point.x},${point.y}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

function pathClearsObstacles(points: Point[], obstacles: Rect[]): boolean {
  return obstacles.every((obstacle) => points.every((point, index) => {
    if (index === 0) return true;
    return !segmentIntersectsRect(points[index - 1], point, inflateRect(obstacle, DEFAULT_CLEARANCE), 0, 0);
  }));
}

/**
 * Chooses among a deliberately small set of shape-safe alternatives. The score is intentionally
 * edge-focused: labels and markers are not available at this routing layer yet, while shape
 * clearance remains a hard constraint in routeOrthogonal. A clean crossing is therefore allowed
 * to beat a very long edge detour, but a shared/collinear corridor remains strongly disfavoured.
 */
function selectSoftCandidate(
  candidates: Point[][],
  previousEdges: Point[][],
  shapes: Rect[] = [],
  context: SequentialRouteContext = {},
): Point[] {
  return candidates.reduce((best, candidate) => {
    const gap = context.readableEdgeGap ?? DEFAULT_CLEARANCE;
    const shapeGap = context.shapeReadableGap ?? gap;
    const bestPenalty = scoreRouteAgainstEdges(best, previousEdges, gap, shapes, shapeGap);
    const candidatePenalty = scoreRouteAgainstEdges(candidate, previousEdges, gap, shapes, shapeGap);
    // Message flows are especially prone to being mistaken for sequence flows when
    // they share a corridor, so make their interaction costs intentionally stronger.
    const messagePenalty = (penalty: ReturnType<typeof scoreRouteAgainstEdges>) => context.edgeClass === 'message'
      ? {
        ...penalty,
        collinearOverlap: penalty.collinearOverlap * 1.5,
        closeEdgePairs: penalty.closeEdgePairs * 1.5,
        proximityDeficit: penalty.proximityDeficit * 1.5,
      }
      : penalty;
    const bestScore = routePenaltyScore(messagePenalty(bestPenalty));
    const candidateScore = routePenaltyScore(messagePenalty(candidatePenalty));
    const adjustedBestScore = bestScore;
    if (candidateScore < adjustedBestScore) return candidate;
    if (candidateScore > adjustedBestScore) return best;
    // Stable final tie-break, independent of object insertion order.
    const bestKey = best.map((point) => `${point.x},${point.y}`).join(';');
    const candidateKey = candidate.map((point) => `${point.x},${point.y}`).join(';');
    return candidateKey < bestKey ? candidate : best;
  });
}

export interface SequentialRouter {
  /** Routes one edge, then remembers its path as a thin obstacle for every edge routed after it. */
  route(
    start: Point,
    end: Point,
    obstacles: Rect[],
    preferredFirstTurn?: PreferredFirstTurn,
    edgeObstaclePolicy?: EdgeObstaclePolicy,
    context?: SequentialRouteContext,
  ): Point[];
}

/**
 * Wraps routeOrthogonal so a whole diagram's worth of edges can be routed one at a time, each
 * one avoiding every edge routed before it — this replaces the old approach of hand-assigning
 * each edge a "lane index" or "track" to keep them apart, which only worked for the specific
 * collision shapes it was written to handle.
 */
export function createSequentialRouter(options: SequentialRouterOptions = {}): SequentialRouter {
  const edgeObstaclePolicy = options.edgeObstaclePolicy ?? 'hard';
  const routedEdgeObstacles: Rect[] = [];
  const routedEdgePaths: Point[][] = [];
  return {
    route(start, end, obstacles, preferredFirstTurn, routePolicy, context = {}) {
      const policy = routePolicy ?? edgeObstaclePolicy;
      const routingObstacles = policy === 'none'
        ? obstacles
        : [...obstacles, ...routedEdgeObstacles];
      const hardPath = routeOrthogonal(start, end, routingObstacles, DEFAULT_CLEARANCE, preferredFirstTurn);
      const softCandidates = policy === 'soft'
        ? distinctPaths([
          shapeSafePreferredPath(start, end, obstacles, preferredFirstTurn),
          shapeSafePreferredPath(start, end, obstacles, preferredFirstTurn === 'horizontal' ? 'vertical' : 'horizontal'),
          routeOrthogonal(start, end, obstacles, DEFAULT_CLEARANCE),
        ]).filter((candidate) => pathClearsObstacles(candidate, obstacles))
        : [];
      const safeAlternatives = policy === 'soft' || !pathClearsObstacles(hardPath, obstacles)
        ? distinctPaths([
          ...softCandidates,
          shapeSafePreferredPath(start, end, obstacles, preferredFirstTurn),
          shapeSafePreferredPath(start, end, obstacles, preferredFirstTurn === 'horizontal' ? 'vertical' : 'horizontal'),
          ...(policy === 'soft' ? [routeOrthogonal(start, end, obstacles, DEFAULT_CLEARANCE)] : []),
        ]).filter((candidate) => pathClearsObstacles(candidate, obstacles))
        : [];
      const path = safeAlternatives.length > 0 && (
        !pathClearsObstacles(hardPath, obstacles) ||
        safeAlternatives.some((candidate) => shouldPreferSoftPath(hardPath, candidate))
      )
        ? selectSoftCandidate(safeAlternatives, routedEdgePaths, obstacles, {
          ...context,
          readableEdgeGap: context.readableEdgeGap ?? options.readableEdgeGap,
          shapeReadableGap: context.shapeReadableGap ?? options.shapeReadableGap,
          tinyJogThreshold: context.tinyJogThreshold ?? options.tinyJogThreshold,
        })
        : hardPath;
      const simplified = simplifyRoute(path, context.tinyJogThreshold ?? options.tinyJogThreshold ?? 2);
      const finalPath = pathClearsObstacles(simplified, obstacles) ? simplified : path;
      if (policy !== 'none') {
        for (let i = 0; i < finalPath.length - 1; i++) {
          routedEdgeObstacles.push(segmentToThinRect(finalPath[i], finalPath[i + 1], EDGE_OBSTACLE_THICKNESS));
        }
      }
      routedEdgePaths.push(finalPath.map((point) => ({ ...point })));
      return finalPath;
    },
  };
}
