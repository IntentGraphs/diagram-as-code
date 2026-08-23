import type { Point, Rect } from '../geometry.js';
import { classifySegmentInteraction } from '../inspection.js';
import { inflateRect, segmentIntersectsRect } from '../geometry.js';

export type RouteEdgeClass = 'sequence' | 'message' | 'association' | 'unknown';

export interface RoutePenalty {
  /** Length shared by collinear segments, in diagram pixels. */
  collinearOverlap: number;
  /** Number of proper crossings with previously routed edges. */
  edgeCrossings: number;
  /** Number of distinct segment pairs that come within the readable gap. */
  closeEdgePairs: number;
  /** Sum of the missing readable gap for close, non-intersecting pairs. */
  proximityDeficit: number;
  bends: number;
  uTurns: number;
  length: number;
  shapeClearanceDeficit: number;
  closeShapePairs: number;
}

export interface RoutePenaltyWeights {
  collinearOverlap: number;
  edgeCrossings: number;
  proximityDeficit: number;
  closeEdgePairs: number;
  bends: number;
  uTurns: number;
  length: number;
  shapeClearanceDeficit: number;
  closeShapePairs: number;
}

export const DEFAULT_ROUTE_PENALTY_WEIGHTS: RoutePenaltyWeights = {
  // A shared corridor is harder to read than a single clean crossing.
  collinearOverlap: 10_000,
  edgeCrossings: 500,
  proximityDeficit: 8,
  closeEdgePairs: 20,
  bends: 8,
  uTurns: 30,
  length: 0.01,
  shapeClearanceDeficit: 40,
  closeShapePairs: 100,
};

export const DEFAULT_READABLE_EDGE_GAP = 8;

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function routeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += segmentLength(points[i - 1], points[i]);
  return total;
}

export function routeBends(points: Point[]): number {
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

function routeUTurns(points: Point[]): number {
  let turns = 0;
  let previous: Point | undefined;
  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    if (!previous) {
      previous = points[i - 1];
      continue;
    }
    const before = points[i - 1];
    const previousDirection = { x: before.x - previous.x, y: before.y - previous.y };
    const nextDirection = { x: current.x - before.x, y: current.y - before.y };
    if ((previousDirection.x !== 0 && previousDirection.x === -nextDirection.x) ||
        (previousDirection.y !== 0 && previousDirection.y === -nextDirection.y)) turns += 1;
    previous = before;
  }
  return turns;
}

function intervalDistance(a1: number, a2: number, b1: number, b2: number): number {
  const aMin = Math.min(a1, a2);
  const aMax = Math.max(a1, a2);
  const bMin = Math.min(b1, b2);
  const bMax = Math.max(b1, b2);
  return aMax < bMin ? bMin - aMax : bMax < aMin ? aMin - bMax : 0;
}

/** Removes duplicate and redundant collinear points while preserving endpoints. */
export function simplifyRoute(points: Point[], tinyJog = 2): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const compact: Point[] = [];
  for (const point of points) {
    const previous = compact[compact.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) compact.push({ ...point });
  }
  let changed = true;
  while (changed && compact.length > 2) {
    changed = false;
    for (let i = 1; i < compact.length - 1; i++) {
      const a = compact[i - 1];
      const b = compact[i];
      const c = compact[i + 1];
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      const tiny = segmentLength(a, b) <= tinyJog || segmentLength(b, c) <= tinyJog;
      if (collinear || (tiny && (a.x === c.x || a.y === c.y))) {
        compact.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return compact;
}

/** Minimum Euclidean distance for two axis-aligned segments. */
export function axisAlignedSegmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const aHorizontal = a.y === b.y;
  const cHorizontal = c.y === d.y;
  if (aHorizontal && cHorizontal) {
    return Math.abs(a.y - c.y) + intervalDistance(a.x, b.x, c.x, d.x);
  }
  if (!aHorizontal && !cHorizontal) {
    return Math.abs(a.x - c.x) + intervalDistance(a.y, b.y, c.y, d.y);
  }
  const horizontal = aHorizontal ? [a, b] : [c, d];
  const vertical = aHorizontal ? [c, d] : [a, b];
  return intervalDistance(horizontal[0].x, horizontal[1].x, vertical[0].x, vertical[0].x) +
    intervalDistance(vertical[0].y, vertical[1].y, horizontal[0].y, horizontal[0].y);
}

function collinearOverlapLength(a: Point, b: Point, c: Point, d: Point): number {
  if (a.x === b.x && c.x === d.x && a.x === c.x) return intervalDistance(a.y, b.y, c.y, d.y) === 0
    ? Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)))
    : 0;
  if (a.y === b.y && c.y === d.y && a.y === c.y) return intervalDistance(a.x, b.x, c.x, d.x) === 0
    ? Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)))
    : 0;
  return 0;
}

export function scoreRouteAgainstEdges(
  points: Point[],
  previousEdges: Point[][],
  readableGap = DEFAULT_READABLE_EDGE_GAP,
  shapes: Rect[] = [],
  shapeGap = readableGap,
): RoutePenalty {
  let collinearOverlap = 0;
  let edgeCrossings = 0;
  let closeEdgePairs = 0;
  let proximityDeficit = 0;
  let shapeClearanceDeficit = 0;
  let closeShapePairs = 0;
  for (let i = 1; i < points.length; i++) {
    for (const previous of previousEdges) {
      for (let j = 1; j < previous.length; j++) {
        const a = points[i - 1];
        const b = points[i];
        const c = previous[j - 1];
        const d = previous[j];
        const interaction = classifySegmentInteraction(a, b, c, d);
        if (interaction === 'collinear-overlap') collinearOverlap += collinearOverlapLength(a, b, c, d);
        else if (interaction === 'proper-crossing') edgeCrossings += 1;
        const distance = axisAlignedSegmentDistance(a, b, c, d);
        if (interaction === 'none' && distance < readableGap) {
          closeEdgePairs += 1;
          proximityDeficit += readableGap - distance;
        }
      }
    }
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (const shape of shapes) {
      if (segmentIntersectsRect(a, b, shape, 0, 0)) continue;
      if (segmentIntersectsRect(a, b, inflateRect(shape, shapeGap), 0, 0)) {
        closeShapePairs += 1;
        shapeClearanceDeficit += shapeGap;
      }
    }
  }
  return {
    collinearOverlap,
    edgeCrossings,
    closeEdgePairs,
    proximityDeficit,
    bends: routeBends(points),
    uTurns: routeUTurns(points),
    length: routeLength(points),
    shapeClearanceDeficit,
    closeShapePairs,
  };
}

export function routePenaltyScore(penalty: RoutePenalty, weights = DEFAULT_ROUTE_PENALTY_WEIGHTS): number {
  return penalty.collinearOverlap * weights.collinearOverlap +
    penalty.edgeCrossings * weights.edgeCrossings +
    penalty.proximityDeficit * weights.proximityDeficit +
    penalty.closeEdgePairs * weights.closeEdgePairs +
    penalty.uTurns * weights.uTurns +
    penalty.bends * weights.bends +
    penalty.length * weights.length +
    penalty.shapeClearanceDeficit * weights.shapeClearanceDeficit +
    penalty.closeShapePairs * weights.closeShapePairs;
}
