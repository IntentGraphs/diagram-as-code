import type { Point, Rect } from '../geometry.js';
import { segmentIntersectsRect } from '../geometry.js';

export interface VisibilityGraph {
  points: Point[];
  adjacency: Array<Array<{ to: number; dist: number }>>;
}

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}

/**
 * True if an axis-aligned segment passes through a rect's strict interior — touching or
 * running along the boundary (including ending exactly at a corner or edge) is allowed,
 * since obstacle corners and boundary-projection points are themselves legitimate graph nodes
 * an edge is expected to touch. Only entering the open interior blocks the edge.
 */
function segmentCrossesInterior(a: Point, b: Point, rect: Rect): boolean {
  if (a.y === b.y) {
    // Horizontal segment. Can only cross the interior if its y is strictly between the
    // rect's top and bottom (exactly on an edge doesn't count as "interior").
    const y = a.y;
    if (y <= rect.y || y >= rect.y + rect.height) return false;
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    // Strict overlap with the rect's open x-range — touching only at x === rect.x or
    // x === rect.x + rect.width doesn't count as entering the interior.
    return xMax > rect.x && xMin < rect.x + rect.width;
  }
  if (a.x === b.x) {
    // Vertical segment — mirror of the horizontal case.
    const x = a.x;
    if (x <= rect.x || x >= rect.x + rect.width) return false;
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    return yMax > rect.y && yMin < rect.y + rect.height;
  }
  // Should be unreachable — buildVisibilityGraph only ever calls isClear on segments that
  // already passed the sameX/sameY check. Fall back to the general check just in case.
  return segmentIntersectsRect(a, b, rect, 0, 0);
}

/** True if the straight segment between two graph points clears every obstacle's interior. */
function isClear(a: Point, b: Point, obstacles: Rect[]): boolean {
  return obstacles.every((rect) => !segmentCrossesInterior(a, b, rect));
}

/**
 * Builds an orthogonal (Manhattan) visibility graph: a node at `start`, `end`, each obstacle
 * corner, the two L-shaped corners of start/end, and boundary-projection points (where
 * horizontal/vertical lines through existing points meet obstacle edges). Two nodes get a graph
 * edge only if they share an x or y coordinate AND the straight segment between them doesn't
 * cross any obstacle — this is what keeps every path axis-aligned and obstacle-free by
 * construction, rather than by checking each path afterward.
 */
export function buildVisibilityGraph(start: Point, end: Point, obstacles: Rect[]): VisibilityGraph {
  const seen = new Set<string>();
  const points: Point[] = [];
  const pushUnique = (p: Point) => {
    const key = pointKey(p);
    if (seen.has(key)) return;
    seen.add(key);
    points.push(p);
  };

  // Stage 1: collect start, end, L-corners, and all obstacle corners
  pushUnique(start);
  pushUnique(end);
  pushUnique({ x: end.x, y: start.y });
  pushUnique({ x: start.x, y: end.y });
  for (const rect of obstacles) {
    for (const corner of rectCorners(rect)) pushUnique(corner);
  }

  // Stage 2: add boundary-projection points (where existing points' lines meet obstacle edges)
  const basePoints = [...points]; // snapshot before projections
  for (const p of basePoints) {
    for (const rect of obstacles) {
      // Horizontal projections: if p.y is within rect's vertical span
      if (p.y >= rect.y && p.y <= rect.y + rect.height) {
        pushUnique({ x: rect.x, y: p.y });
        pushUnique({ x: rect.x + rect.width, y: p.y });
      }
      // Vertical projections: if p.x is within rect's horizontal span
      if (p.x >= rect.x && p.x <= rect.x + rect.width) {
        pushUnique({ x: p.x, y: rect.y });
        pushUnique({ x: p.x, y: rect.y + rect.height });
      }
    }
  }

  // Stage 3: build adjacency over complete point set
  const adjacency: Array<Array<{ to: number; dist: number }>> = points.map(() => []);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const sameX = a.x === b.x;
      const sameY = a.y === b.y;
      if (!sameX && !sameY) continue;
      if (!isClear(a, b, obstacles)) continue;
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      adjacency[i].push({ to: j, dist });
      adjacency[j].push({ to: i, dist });
    }
    adjacency[i].sort((a, b) => a.to - b.to);
  }

  return { points, adjacency };
}
