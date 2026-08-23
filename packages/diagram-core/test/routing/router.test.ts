import { describe, it, expect } from 'vitest';
import { routeOrthogonal, createSequentialRouter, getRouteFallbackCount, getRouteFallbackDetails, resetRouteFallbackCount } from '../../src/routing/router.js';
import { segmentIntersectsRect } from '../../src/geometry.js';
import type { Rect, Point } from '../../src/geometry.js';
import { scoreRouteAgainstEdges, simplifyRoute } from '../../src/routing/routeCost.js';

// Mirrors router.ts EDGE_OBSTACLE_THICKNESS so the assertion uses the same thin-rect size.
const EDGE_OBSTACLE_THICKNESS = 4;
const EDGE_OBSTACLE_HALF = EDGE_OBSTACLE_THICKNESS / 2;

function pathClearsRect(points: Point[], rect: Rect): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentIntersectsRect(points[i], points[i + 1], rect, 0, 0)) return false;
  }
  return true;
}

describe('routeOrthogonal', () => {
  it('returns a direct L-path when there are no obstacles', () => {
    const path = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 50 }, []);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 50 });
    expect(path.length).toBe(3);
  });

  it('routes around a single obstacle sitting between start and end', () => {
    const obstacle: Rect = { x: 40, y: -20, width: 20, height: 40 };
    const path = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle]);
    expect(pathClearsRect(path, obstacle)).toBe(true);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it('falls back to an orthogonal L-corner instead of a raw diagonal, and counts it', () => {
    resetRouteFallbackCount();
    const start = { x: 0, y: 0 };
    const end = { x: 50, y: 50 };
    const walls: Rect[] = [
      { x: 30, y: 30, width: 40, height: 2 },
      { x: 30, y: 68, width: 40, height: 2 },
      { x: 30, y: 30, width: 2, height: 40 },
      { x: 68, y: 30, width: 2, height: 40 },
    ];
    const path = routeOrthogonal(start, end, walls, 5);
    expect(path[0]).toEqual(start);
    expect(path[path.length - 1]).toEqual(end);
    expect(path.length).toBe(3);
    for (let i = 0; i < path.length - 1; i++) {
      expect(path[i].x === path[i + 1].x || path[i].y === path[i + 1].y).toBe(true);
    }
    expect(getRouteFallbackCount()).toBe(1);
    expect(getRouteFallbackDetails()[0]).toMatchObject({ obstacleCount: 4, requestedClearance: 5, fallback: 'l-corner' });
  });

  it('retries at clearance 2 before giving up, when a tighter (but still legal) path exists', () => {
    // Same sealed-ring pattern as the clearance-4 retry, but the left-wall gap is only 6px
    // so inflation of 4 or more closes it. Current retries stop at 4 and miss this path.
    const start = { x: 0, y: 50 };
    const end = { x: 50, y: 50 };
    const walls: Rect[] = [
      { x: 30, y: 30, width: 40, height: 2 },
      { x: 30, y: 68, width: 40, height: 2 },
      { x: 68, y: 30, width: 2, height: 40 },
      { x: 30, y: 30, width: 2, height: 27 },  // left-top: y 30..57
      { x: 30, y: 63, width: 2, height: 7 },   // left-bottom: y 63..70 (gap y 57..63)
    ];
    const path = routeOrthogonal(start, end, walls);
    const wentThroughGap = path.length > 2 && path.some((p) => p.y !== 50);
    expect(wentThroughGap).toBe(true);
  });

  it('returns immediately without hanging when start and end are the same point', () => {
    const point = { x: 50, y: 50 };
    const path = routeOrthogonal(point, point, []);
    expect(path).toEqual([point, point]);
  });

  it('retries at reduced clearance before giving up, when a tighter (but still legal) path exists', () => {
    // Verified in dev (buildVisibilityGraph/shortestPath run directly against this exact wall
    // set): `end` sits inside a ring of walls that's fully sealed — no path at all — once
    // inflated by clearance 10 or 6, but opens into a real, findable detour (through a 10px gap
    // in the left wall, offset well away from start/end's shared y=50 so the fix can't be
    // confused with a lucky direct line) at clearance 4.
    const start = { x: 0, y: 50 };
    const end = { x: 50, y: 50 };
    const walls: Rect[] = [
      { x: 30, y: 30, width: 40, height: 2 },  // top
      { x: 30, y: 68, width: 40, height: 2 },  // bottom
      { x: 68, y: 30, width: 2, height: 40 },  // right
      { x: 30, y: 30, width: 2, height: 25 },  // left-top: y 30..55
      { x: 30, y: 65, width: 2, height: 5 },   // left-bottom: y 65..70 (gap y 55..65, centered 60)
    ];
    const path = routeOrthogonal(start, end, walls);
    // A true fallback is an L-corner (3 points), not a 2-point diagonal; a legitimate path
    // through this offset gap must detour away from y=50 (verified in dev: the actual
    // clearance-4 path is 6 points, including one pair at y=59) — that's what distinguishes
    // "found a real path" from "gave up" here.
    const wentThroughGap = path.length > 2 && path.some((p) => p.y !== 50);
    expect(wentThroughGap).toBe(true);
  });
});

describe('createSequentialRouter', () => {
  it('routes a later edge around an earlier edge\'s own path', () => {
    const router = createSequentialRouter();
    // Short middle segment first; a later edge along the same y must detour around it.
    const first = router.route({ x: 20, y: 0 }, { x: 80, y: 0 }, []);
    const second = router.route({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    // Without accumulation, second would be the direct horizontal [(0,0),(100,0)].
    expect(second).not.toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    for (let i = 0; i < first.length - 1; i++) {
      const obstacle: Rect = {
        x: Math.min(first[i].x, first[i + 1].x) - EDGE_OBSTACLE_HALF,
        y: Math.min(first[i].y, first[i + 1].y) - EDGE_OBSTACLE_HALF,
        width: Math.abs(first[i + 1].x - first[i].x) + EDGE_OBSTACLE_THICKNESS,
        height: Math.abs(first[i + 1].y - first[i].y) + EDGE_OBSTACLE_THICKNESS,
      };
      expect(pathClearsRect(second, obstacle)).toBe(true);
    }
  });

  it('allows a much shorter shape-safe path to cross an earlier edge in soft mode', () => {
    const router = createSequentialRouter({ edgeObstaclePolicy: 'soft' });
    router.route({ x: -100, y: 50 }, { x: 200, y: 50 }, []);
    const second = router.route({ x: 50, y: 0 }, { x: 50, y: 100 }, [], 'vertical');
    expect(second).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
  });

  it('prefers a clean crossing over a collinear shared corridor in soft mode', () => {
    const previous = [{ x: -100, y: 50 }, { x: 200, y: 50 }];
    const crossing = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const overlap = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    expect(scoreRouteAgainstEdges(crossing, [previous]).collinearOverlap).toBe(0);
    expect(scoreRouteAgainstEdges(crossing, [previous]).edgeCrossings).toBe(1);
    expect(scoreRouteAgainstEdges(overlap, [previous]).collinearOverlap).toBe(100);
  });

  it('keeps shape obstacles hard while selecting soft candidates', () => {
    const router = createSequentialRouter({ edgeObstaclePolicy: 'soft' });
    const obstacle = { x: 40, y: 20, width: 20, height: 60 };
    const path = router.route({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle], 'horizontal');
    expect(pathClearsRect(path, obstacle)).toBe(true);
  });

  it('skips accumulated edge obstacles in none mode while retaining shape obstacles', () => {
    const router = createSequentialRouter({ edgeObstaclePolicy: 'none' });
    router.route({ x: 20, y: 0 }, { x: 80, y: 0 }, []);
    const second = router.route({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(second).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    const obstacle = { x: 40, y: -20, width: 20, height: 40 };
    const aroundShape = createSequentialRouter({ edgeObstaclePolicy: 'none' }).route(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
    );
    expect(pathClearsRect(aroundShape, obstacle)).toBe(true);
  });

  it('chooses the same path across repeated runs', () => {
    const obstacles = [{ x: 40, y: -20, width: 20, height: 40 }];
    const first = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, obstacles);
    const second = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, obstacles);
    expect(second).toEqual(first);
  });

  it('simplifies duplicate and collinear points while preserving endpoints', () => {
    const path = simplifyRoute([
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 },
    ]);
    expect(path).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  });

  it('scores a route close to a shape without treating the shape clearance ring as a collision', () => {
    const shape = { x: 40, y: 40, width: 20, height: 20 };
    const penalty = scoreRouteAgainstEdges(
      [{ x: 0, y: 30 }, { x: 100, y: 30 }], [], 8, [shape], 12,
    );
    expect(penalty.shapeClearanceDeficit).toBeGreaterThan(0);
    expect(penalty.closeShapePairs).toBeGreaterThan(0);
  });

  it('preserves distinct message-flow route context without changing hard shape safety', () => {
    const router = createSequentialRouter({ edgeObstaclePolicy: 'soft', readableEdgeGap: 12 });
    const shape = { x: 40, y: 20, width: 20, height: 60 };
    const path = router.route(
      { x: 0, y: 0 }, { x: 100, y: 0 }, [shape], 'horizontal', 'soft',
      { edgeClass: 'message', shapeReadableGap: 12 },
    );
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 0 });
    expect(pathClearsRect(path, shape)).toBe(true);
  });
});
