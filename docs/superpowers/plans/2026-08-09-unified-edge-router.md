# Unified Obstacle-Avoiding Edge Router Implementation Plan

> **Status:** PAUSED after Task 7 (HEAD `5225cb9` on `explore/unified-edge-router`). Tasks 1–7 complete and reviewed. Resume from **`docs/superpowers/plans/2026-08-10-unified-edge-router-resume.md`** (Tasks 8–9 finishing + Task 10 whole-branch review). SDD ledger: `.superpowers/sdd/2026-08-09-unified-edge-router/progress.md`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Prefer the resume plan for remaining work — it corrects the optimistic assumption that `BASELINE_CROSSINGS` would drop.

**Goal:** Replace the two hand-rolled, bug-prone edge-routing layers (boundary-event routing and swimlane cross-lane channel routing) with one shared orthogonal visibility-graph router, so "an edge never crosses a node or another edge" is a structural property of the algorithm instead of a set of enumerated special cases.

**Architecture:** A new `packages/layout-core/src/routing/` module builds an orthogonal (Manhattan) visibility graph from a start point, end point, and a set of obstacle rectangles, then runs Dijkstra for the shortest rectilinear path. A stateful "sequential router" wrapper accumulates each routed edge's own polyline as a thin obstacle rectangle for edges routed after it, so later edges automatically avoid earlier ones without any hand-written lane/track-index bookkeeping. `boundaryEvents.ts` and `laneBanding.ts` keep their existing anchor-point selection (which side of a node an edge exits/enters) and, in `laneBanding.ts`'s case, its existing channel-gap sizing — only the "how does the path get from A to B without hitting anything" part is replaced.

**Tech Stack:** TypeScript, Vitest. No new runtime dependencies — the router is hand-written (visibility graph + Dijkstra), matching the project's existing zero-dependency approach to geometry code (see `boundaryEvents.ts`'s own Liang-Barsky implementation).

## Global Constraints

- No new npm dependencies (spec: "no new dependencies", matches existing zero-dependency geometry code in the codebase).
- Must not regress `packages/layout-engine-swimlane/test/crossing-regression.test.ts`'s `nodeOverlaps: []` and `edgeThroughNode: []` assertions on any diagram in `VERIFICATION_DIAGRAMS` (spec: "no regression on the guarantee that already holds").
- `BASELINE_CROSSINGS` values in that same file are expected to change (most should drop) and must be re-measured against actual output, not guessed.
- All work happens on branch `explore/unified-edge-router` (already checked out); do not merge to `main` as part of this plan.
- Visibility-graph construction is O(n²) on obstacle corners — acceptable at this project's scale (dozens–low hundreds of nodes per diagram); do not add caching/spatial-indexing optimizations (explicit non-goal, YAGNI).

---

## File Structure

New:
- `packages/layout-core/src/routing/geometry.ts` — `Point`, `Rect` types; `segmentIntersectsRect`; `inflateRect`.
- `packages/layout-core/src/routing/visibilityGraph.ts` — `buildVisibilityGraph`.
- `packages/layout-core/src/routing/pathfind.ts` — `shortestPath` (Dijkstra).
- `packages/layout-core/src/routing/router.ts` — `routeOrthogonal`, `createSequentialRouter`.
- `packages/layout-core/test/routing/geometry.test.ts`
- `packages/layout-core/test/routing/visibilityGraph.test.ts`
- `packages/layout-core/test/routing/pathfind.test.ts`
- `packages/layout-core/test/routing/router.test.ts`

Modified:
- `packages/layout-core/src/index.ts` — export the new router API.
- `packages/layout-core/src/boundaryEvents.ts` — replace `routeAroundScope`/`clearFinalApproachY`/`segmentIntersectsRect` with calls into the shared router.
- `packages/layout-engine-swimlane/src/laneBanding.ts` — replace the hand-built multi-channel trunk/track path construction with calls into the shared router; keep gap sizing (`assignTracks`/`channelGap`) as-is.
- `packages/layout-engine-swimlane/test/crossing-regression.test.ts` — re-measure and update `BASELINE_CROSSINGS`.
- `docs/STATUS.md` — remove the three now-fixed known limitations from the "Known limitations" section.

Unchanged (deliberately): `packages/layout-core/test-utils/geometry.ts` (independent verification ground truth), `packages/layout-engine-swimlane/src/channelRouting.ts` (`assignTracks` keeps its existing job: sizing channel gaps), all three external layout engines (ELK/Dagre/Graphviz) and their native edge routing.

---

### Task 1: Shared geometry primitives

**Files:**
- Create: `packages/layout-core/src/routing/geometry.ts`
- Test: `packages/layout-core/test/routing/geometry.test.ts`

**Interfaces:**
- Produces: `Point { x: number; y: number }`, `Rect { x: number; y: number; width: number; height: number }`, `segmentIntersectsRect(p1: Point, p2: Point, rect: Rect, marginX?: number, marginY?: number): boolean`, `inflateRect(rect: Rect, margin: number): Rect`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/layout-core/test/routing/geometry.test.ts
import { describe, it, expect } from 'vitest';
import { segmentIntersectsRect, inflateRect } from '../../src/routing/geometry.js';

describe('segmentIntersectsRect', () => {
  it('detects a horizontal segment passing through a rect', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(segmentIntersectsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, rect)).toBe(true);
  });

  it('returns false for a segment that passes well outside a rect', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 40, y: 0 }, rect)).toBe(false);
  });

  it('returns false for a segment that only grazes within the margin', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    // Segment runs along y=11, within the default 3px margin of the rect's top edge (y=10).
    expect(segmentIntersectsRect({ x: 0, y: 11 }, { x: 40, y: 11 }, rect)).toBe(false);
  });

  it('returns false when margins shrink the rect to zero or negative size', () => {
    const rect = { x: 10, y: 10, width: 4, height: 4 };
    expect(segmentIntersectsRect({ x: 0, y: 12 }, { x: 40, y: 12 }, rect, 3, 3)).toBe(false);
  });
});

describe('inflateRect', () => {
  it('expands a rect by the margin on every side', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(inflateRect(rect, 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-core/test/routing/geometry.test.ts`
Expected: FAIL — `Cannot find module '../../src/routing/geometry.js'`

- [ ] **Step 3: Implement**

```typescript
// packages/layout-core/src/routing/geometry.ts
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Liang-Barsky segment-vs-AABB, shrinking the rect by (marginX, marginY) on each side first. */
export function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: Rect,
  marginX = 3,
  marginY = 3,
): boolean {
  const rx = rect.x + marginX;
  const ry = rect.y + marginY;
  const rw = rect.width - 2 * marginX;
  const rh = rect.height - 2 * marginY;
  if (rw <= 0 || rh <= 0) return false;

  let t0 = 0;
  let t1 = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const checks: Array<[number, number]> = [
    [-dx, p1.x - rx],
    [dx, rx + rw - p1.x],
    [-dy, p1.y - ry],
    [dy, ry + rh - p1.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function inflateRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + 2 * margin,
    height: rect.height + 2 * margin,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-core/test/routing/geometry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/routing/geometry.ts packages/layout-core/test/routing/geometry.test.ts
git commit -m "feat(layout-core): add shared routing geometry primitives"
```

---

### Task 2: Orthogonal visibility graph

**Files:**
- Create: `packages/layout-core/src/routing/visibilityGraph.ts`
- Test: `packages/layout-core/test/routing/visibilityGraph.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `segmentIntersectsRect` from `./geometry.js` (Task 1).
- Produces: `VisibilityGraph { points: Point[]; adjacency: Array<Array<{ to: number; dist: number }>> }`, `buildVisibilityGraph(start: Point, end: Point, obstacles: Rect[]): VisibilityGraph`. By convention, `points[0] === start` and `points[1] === end` always.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/layout-core/test/routing/visibilityGraph.test.ts
import { describe, it, expect } from 'vitest';
import { buildVisibilityGraph } from '../../src/routing/visibilityGraph.js';

describe('buildVisibilityGraph', () => {
  it('puts start at index 0 and end at index 1', () => {
    const graph = buildVisibilityGraph({ x: 0, y: 0 }, { x: 100, y: 100 }, []);
    expect(graph.points[0]).toEqual({ x: 0, y: 0 });
    expect(graph.points[1]).toEqual({ x: 100, y: 100 });
  });

  it('connects start and end via an L-shaped corner when there are no obstacles', () => {
    const graph = buildVisibilityGraph({ x: 0, y: 0 }, { x: 100, y: 50 }, []);
    // No direct edge (start/end don't share x or y), but each must reach at least one
    // of the two L-corners: (100, 0) and (0, 50).
    const cornerA = graph.points.findIndex((p) => p.x === 100 && p.y === 0);
    const cornerB = graph.points.findIndex((p) => p.x === 0 && p.y === 50);
    expect(cornerA).toBeGreaterThanOrEqual(0);
    expect(cornerB).toBeGreaterThanOrEqual(0);
    const startNeighbors = graph.adjacency[0].map((e) => e.to);
    expect(startNeighbors).toEqual(expect.arrayContaining([cornerA, cornerB]));
  });

  it('does not connect two points whose shared-axis segment crosses an obstacle', () => {
    const obstacle = { x: 40, y: -10, width: 20, height: 40 };
    const graph = buildVisibilityGraph({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle]);
    // start (0,0) and end (100,0) share y=0, but the obstacle sits directly between them.
    const startNeighbors = graph.adjacency[0].map((e) => e.to);
    expect(startNeighbors).not.toContain(1);
  });

  it('includes every obstacle corner as a graph point', () => {
    const obstacle = { x: 40, y: 10, width: 20, height: 20 };
    const graph = buildVisibilityGraph({ x: 0, y: 0 }, { x: 100, y: 100 }, [obstacle]);
    const corners = [
      { x: 40, y: 10 }, { x: 60, y: 10 }, { x: 40, y: 30 }, { x: 60, y: 30 },
    ];
    for (const corner of corners) {
      expect(graph.points).toEqual(expect.arrayContaining([corner]));
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-core/test/routing/visibilityGraph.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// packages/layout-core/src/routing/visibilityGraph.ts
import type { Point, Rect } from './geometry.js';
import { segmentIntersectsRect } from './geometry.js';

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

/** True if the straight segment between two graph points clears every obstacle. */
function isClear(a: Point, b: Point, obstacles: Rect[]): boolean {
  return obstacles.every((rect) => !segmentIntersectsRect(a, b, rect, 0, 0));
}

/**
 * Builds an orthogonal (Manhattan) visibility graph: a node at `start`, `end`, each obstacle
 * corner, and the two L-shaped corners of start/end (so a path exists even with zero
 * obstacles, since start and end otherwise won't share an x or y coordinate). Two nodes get
 * a graph edge only if they share an x or y coordinate AND the straight segment between them
 * doesn't cross any obstacle — this is what keeps every path axis-aligned and obstacle-free
 * by construction, rather than by checking each path afterward.
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

  pushUnique(start);
  pushUnique(end);
  pushUnique({ x: end.x, y: start.y });
  pushUnique({ x: start.x, y: end.y });
  for (const rect of obstacles) {
    for (const corner of rectCorners(rect)) pushUnique(corner);
  }

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
  }

  return { points, adjacency };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-core/test/routing/visibilityGraph.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/routing/visibilityGraph.ts packages/layout-core/test/routing/visibilityGraph.test.ts
git commit -m "feat(layout-core): add orthogonal visibility graph builder"
```

---

### Task 3: Shortest path over the visibility graph

**Files:**
- Create: `packages/layout-core/src/routing/pathfind.ts`
- Test: `packages/layout-core/test/routing/pathfind.test.ts`

**Interfaces:**
- Consumes: `VisibilityGraph` from `./visibilityGraph.js` (Task 2).
- Produces: `shortestPath(graph: VisibilityGraph, startIndex: number, endIndex: number): number[] | null` — returns the sequence of point indices from `startIndex` to `endIndex` inclusive, or `null` if unreachable.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/layout-core/test/routing/pathfind.test.ts
import { describe, it, expect } from 'vitest';
import { shortestPath } from '../../src/routing/pathfind.js';
import type { VisibilityGraph } from '../../src/routing/visibilityGraph.js';

describe('shortestPath', () => {
  it('finds a direct path when start and end are adjacent', () => {
    const graph: VisibilityGraph = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      adjacency: [[{ to: 1, dist: 10 }], [{ to: 0, dist: 10 }]],
    };
    expect(shortestPath(graph, 0, 1)).toEqual([0, 1]);
  });

  it('picks the shorter of two routes', () => {
    // 0 -> 1 -> 3 costs 10+10=20; 0 -> 2 -> 3 costs 100+100=200.
    const graph: VisibilityGraph = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 100 }, { x: 10, y: 10 }],
      adjacency: [
        [{ to: 1, dist: 10 }, { to: 2, dist: 100 }],
        [{ to: 0, dist: 10 }, { to: 3, dist: 10 }],
        [{ to: 0, dist: 100 }, { to: 3, dist: 100 }],
        [{ to: 1, dist: 10 }, { to: 2, dist: 100 }],
      ],
    };
    expect(shortestPath(graph, 0, 3)).toEqual([0, 1, 3]);
  });

  it('returns null when there is no path', () => {
    const graph: VisibilityGraph = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      adjacency: [[], []],
    };
    expect(shortestPath(graph, 0, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-core/test/routing/pathfind.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// packages/layout-core/src/routing/pathfind.ts
import type { VisibilityGraph } from './visibilityGraph.js';

/** Dijkstra's algorithm over the visibility graph's index-addressed adjacency list. */
export function shortestPath(graph: VisibilityGraph, startIndex: number, endIndex: number): number[] | null {
  const dist = new Array<number>(graph.points.length).fill(Infinity);
  const prev = new Array<number>(graph.points.length).fill(-1);
  const visited = new Array<boolean>(graph.points.length).fill(false);
  dist[startIndex] = 0;

  for (let iter = 0; iter < graph.points.length; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < graph.points.length; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    if (u === endIndex) break;
    visited[u] = true;
    for (const { to, dist: edgeDist } of graph.adjacency[u]) {
      const candidate = dist[u] + edgeDist;
      if (candidate < dist[to]) {
        dist[to] = candidate;
        prev[to] = u;
      }
    }
  }

  if (dist[endIndex] === Infinity) return null;

  const path: number[] = [];
  let cur = endIndex;
  while (cur !== -1) {
    path.unshift(cur);
    if (cur === startIndex) break;
    cur = prev[cur];
  }
  return path;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-core/test/routing/pathfind.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/routing/pathfind.ts packages/layout-core/test/routing/pathfind.test.ts
git commit -m "feat(layout-core): add Dijkstra shortest-path over visibility graph"
```

---

### Task 4: Public router API (`routeOrthogonal` + sequential accumulation)

**Files:**
- Create: `packages/layout-core/src/routing/router.ts`
- Test: `packages/layout-core/test/routing/router.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `inflateRect` from `./geometry.js`; `buildVisibilityGraph` from `./visibilityGraph.js`; `shortestPath` from `./pathfind.js`.
- Produces: `routeOrthogonal(start: Point, end: Point, obstacles: Rect[], clearance?: number): Point[]`; `SequentialRouter { route(start: Point, end: Point, obstacles: Rect[]): Point[] }`; `createSequentialRouter(): SequentialRouter`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/layout-core/test/routing/router.test.ts
import { describe, it, expect } from 'vitest';
import { routeOrthogonal, createSequentialRouter } from '../../src/routing/router.js';
import { segmentIntersectsRect } from '../../src/routing/geometry.js';
import type { Rect, Point } from '../../src/routing/geometry.js';

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

  it('falls back to a straight line when no path exists', () => {
    // Four thin walls fully enclosing the end point with no gap wider than the clearance.
    const end = { x: 50, y: 50 };
    const walls: Rect[] = [
      { x: 30, y: 30, width: 40, height: 2 },  // top
      { x: 30, y: 68, width: 40, height: 2 },  // bottom
      { x: 30, y: 30, width: 2, height: 40 },  // left
      { x: 68, y: 30, width: 2, height: 40 },  // right
    ];
    const path = routeOrthogonal({ x: 0, y: 0 }, end, walls, 5);
    expect(path).toEqual([{ x: 0, y: 0 }, end]);
  });
});

describe('createSequentialRouter', () => {
  it('routes a later edge around an earlier edge\'s own path', () => {
    const router = createSequentialRouter();
    const first = router.route({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    // Second edge crosses the same corridor; it must not run along the same segment as `first`.
    const second = router.route({ x: 0, y: 10 }, { x: 100, y: 10 }, []);
    // Assert no segment of `second` exactly overlaps a segment of `first` (same two endpoints).
    const firstSegments = new Set(
      first.slice(0, -1).map((p, i) => `${p.x},${p.y}-${first[i + 1].x},${first[i + 1].y}`),
    );
    const secondSegments = second.slice(0, -1).map((p, i) => `${p.x},${p.y}-${second[i + 1].x},${second[i + 1].y}`);
    for (const seg of secondSegments) expect(firstSegments.has(seg)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-core/test/routing/router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// packages/layout-core/src/routing/router.ts
import type { Point, Rect } from './geometry.js';
import { inflateRect } from './geometry.js';
import { buildVisibilityGraph } from './visibilityGraph.js';
import { shortestPath } from './pathfind.js';

const DEFAULT_CLEARANCE = 10;
const EDGE_OBSTACLE_THICKNESS = 4;

/**
 * Finds the shortest orthogonal (Manhattan) path from `start` to `end` that clears every
 * obstacle by `clearance` pixels. Obstacles must already exclude the edge's own source and
 * target nodes (a path has to touch its own endpoints' nodes, so those can't be obstacles).
 * Falls back to a direct line if no clear path exists at all — this should be unreachable
 * given normal diagram spacing, but the caller must never crash on it.
 */
export function routeOrthogonal(
  start: Point,
  end: Point,
  obstacles: Rect[],
  clearance = DEFAULT_CLEARANCE,
): Point[] {
  const inflated = obstacles.map((rect) => inflateRect(rect, clearance));
  const graph = buildVisibilityGraph(start, end, inflated);
  const path = shortestPath(graph, 0, 1);
  if (!path) return [start, end];
  return path.map((index) => graph.points[index]);
}

function segmentToThinRect(p1: Point, p2: Point, thickness: number): Rect {
  return {
    x: Math.min(p1.x, p2.x) - thickness / 2,
    y: Math.min(p1.y, p2.y) - thickness / 2,
    width: Math.abs(p2.x - p1.x) + thickness,
    height: Math.abs(p2.y - p1.y) + thickness,
  };
}

export interface SequentialRouter {
  /** Routes one edge, then remembers its path as a thin obstacle for every edge routed after it. */
  route(start: Point, end: Point, obstacles: Rect[]): Point[];
}

/**
 * Wraps routeOrthogonal so a whole diagram's worth of edges can be routed one at a time, each
 * one avoiding every edge routed before it — this replaces the old approach of hand-assigning
 * each edge a "lane index" or "track" to keep them apart, which only worked for the specific
 * collision shapes it was written to handle.
 */
export function createSequentialRouter(): SequentialRouter {
  const routedEdgeObstacles: Rect[] = [];
  return {
    route(start, end, obstacles) {
      const path = routeOrthogonal(start, end, [...obstacles, ...routedEdgeObstacles]);
      for (let i = 0; i < path.length - 1; i++) {
        routedEdgeObstacles.push(segmentToThinRect(path[i], path[i + 1], EDGE_OBSTACLE_THICKNESS));
      }
      return path;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-core/test/routing/router.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/routing/router.ts packages/layout-core/test/routing/router.test.ts
git commit -m "feat(layout-core): add routeOrthogonal and sequential multi-edge router"
```

---

### Task 5: Export the router from `@bpm/layout-core`

**Files:**
- Modify: `packages/layout-core/src/index.ts`

**Interfaces:**
- Consumes: `routeOrthogonal`, `createSequentialRouter`, `SequentialRouter` from `./routing/router.js`; `Point`, `Rect` from `./routing/geometry.js`.
- Produces: same names, re-exported from `@bpm/layout-core`, so `packages/layout-engine-swimlane` (which already depends on `@bpm/layout-core`) can import them.

- [ ] **Step 1: Modify the barrel export**

```typescript
// packages/layout-core/src/index.ts
export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from './types.js';
export { positionBoundaryEvents } from './boundaryEvents.js';
export {
  registerEngine, clearEngines, selectEngine, getEngineByName, type LayoutEngine,
} from './engine.js';
export { routeOrthogonal, createSequentialRouter, type SequentialRouter } from './routing/router.js';
export type { Point, Rect } from './routing/geometry.js';
```

- [ ] **Step 2: Build and verify the export resolves**

Run: `npm run build --workspace=@bpm/layout-core`
Expected: builds cleanly; `packages/layout-core/dist/index.d.ts` includes `routeOrthogonal`, `createSequentialRouter`, `SequentialRouter`, `Point`, `Rect`.

- [ ] **Step 3: Commit**

```bash
git add packages/layout-core/src/index.ts
git commit -m "feat(layout-core): export routeOrthogonal and createSequentialRouter"
```

---

### Task 6: Integrate the router into boundary-event routing

**Files:**
- Modify: `packages/layout-core/src/boundaryEvents.ts`
- Test: `packages/layout-core/test/` (existing boundary-event tests — locate with `find packages/layout-core/test -iname "*boundary*"` before starting; extend whatever exists there)

**Interfaces:**
- Consumes: `createSequentialRouter`, `SequentialRouter` from `./routing/router.js`.
- Produces: `positionBoundaryEvents` (unchanged signature: `(diagram: Diagram, positioned: PositionedDiagram) => PositionedDiagram`).

This task removes `routeAroundScope`, `clearFinalApproachY`, `segmentIntersectsRect`, `APPROACH_CLEARANCE`, and the `laneIndexByEdgeId`/`byDescendingTargetY` lane-offset scheme from `boundaryEvents.ts`, and replaces the routing step with one shared `SequentialRouter`. Anchor-point selection (`bottomBorder` for the source, `leftBorder`/`rightBorder` for the target depending on sweep direction) is kept exactly as-is — only the path *between* those two points changes.

- [ ] **Step 1: Locate existing tests for this file**

Run: `grep -rl "positionBoundaryEvents" packages/layout-core/test packages/layout-engine-swimlane/test 2>/dev/null`

Read whatever files this returns before making changes, so the existing expected behavior (which anchor points, which diagrams) is understood.

- [ ] **Step 2: Replace the routing internals**

Remove these from `packages/layout-core/src/boundaryEvents.ts`: the `segmentIntersectsRect` function (lines ~72–111 in the current file), `APPROACH_CLEARANCE` constant, `clearFinalApproachY` function, and `routeAroundScope` function. Remove the `byDescendingTargetY`/`laneIndexByEdgeId` block inside `positionBoundaryEvents`. Replace the final routing loop with:

```typescript
// Replaces: const byDescendingTargetY = ...; const laneIndexByEdgeId = ...;
const router = createSequentialRouter();

for (const route of boundaryRoutes) {
  const excludeIds = new Set<string>([route.target.id]);
  if (route.hostId) excludeIds.add(route.hostId);
  const targetEntry = sweepEntryPoint(route.start, route.target);
  const obstacles = route.obstacles.filter((n) => !excludeIds.has(n.id));
  const points = router.route(route.start, targetEntry, obstacles);
  push(addedEdges, route.scope.containerId, { ...route.edge, points });
}
```

Add this helper above `positionBoundaryEvents`, replacing the old sweep-direction logic that used to live inline in `routeAroundScope`:

```typescript
/** Enter the target via whichever border (left or right) faces the incoming edge. */
function sweepEntryPoint(start: { x: number; y: number }, target: PositionedNode): { x: number; y: number } {
  const sweepLeft = target.x + target.width / 2 < start.x;
  return sweepLeft ? leftBorder(target) : rightBorder(target);
}
```

Add the import at the top of the file:

```typescript
import { createSequentialRouter } from './routing/router.js';
```

- [ ] **Step 3: Run the existing test suite for this package**

Run: `npx vitest run packages/layout-core`
Expected: All previously-passing tests still pass. If any fail, read the failure carefully — a changed edge *shape* (e.g., fewer or more points) is expected and fine as long as the assertion is about behavior (no overlap, correct endpoints), not exact point-for-point equality. If a test asserts exact intermediate points, update it to assert the geometric property instead (e.g., "path doesn't cross rect X") rather than hard-coding the new router's specific coordinates.

- [ ] **Step 4: Run the swimlane crossing-regression suite**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Expected: The `nodeOverlaps: []` and `edgeThroughNode: []` assertions still pass for every diagram. The `BASELINE_CROSSINGS` numeric assertions will likely fail — that's expected at this point; do not edit `BASELINE_CROSSINGS` yet, that happens in Task 8 after both routing layers are migrated.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/boundaryEvents.ts
git commit -m "refactor(layout-core): route boundary-event edges via shared orthogonal router"
```

---

### Task 7: Integrate the router into swimlane cross-lane channel routing

**Files:**
- Modify: `packages/layout-engine-swimlane/src/laneBanding.ts`

**Interfaces:**
- Consumes: `createSequentialRouter`, `SequentialRouter` from `@bpm/layout-core`.
- Produces: `bandLanes` (unchanged signature: `(diagram: Diagram, positioned: PositionedDiagram) => PositionedDiagram`).

This task keeps `assignTracks`/`channelGap`/`laneHeight` exactly as-is — they size the vertical gap between lane bands, which is macro layout, not routing. It replaces the hand-built multi-channel trunk-corridor construction (the `trunkX`/`orderedChannels`/`trackY` block) with calls into the shared router. Anchor points (`exitStub`, `entryStub`, `preferRight`, `goingDown`) are kept exactly as-is.

- [ ] **Step 1: Replace the per-edge path construction loop**

In `packages/layout-engine-swimlane/src/laneBanding.ts`, the loop currently building `points` for each `interval` (lines ~131–198) computes `start`, `exitStub`, `end`, `entryStub` from existing logic — keep all of that. Replace only the middle-path construction (everything between computing `exitStub`/`entryStub` and pushing them into `points`) with a single router call. The new loop body:

```typescript
const router = createSequentialRouter(); // declare once, before the `for (const interval of channelIntervals)` loop

// ...inside the loop, after `exitStub` and `entryStub` are computed as today...
const allPoolNodes = lanesNodes.flat();
const obstacles = allPoolNodes.filter((n) => n.id !== edge.sourceId && n.id !== edge.targetId);
const middlePoints = router.route(exitStub, entryStub, obstacles);
const points: Array<{ x: number; y: number }> = [start, ...middlePoints, end];
repairedEdgePoints.set(interval.id, points);
allChannelRepairedEdgeIds.add(interval.id);
```

Note: `obstacles` uses `allPoolNodes`'s positions from *before* banding's y-shift is applied to them via `deltaYById` — but the router needs each node's *final* (post-banding) rectangle, since that's where the path actually has to avoid them. Because `deltaYById` is fully populated for every node in the pool by the time this loop runs (it's computed earlier in `bandLanes`, in the `pool.lanes.forEach` block above), build the obstacle list from shifted rectangles instead:

```typescript
const obstacles = allPoolNodes
  .filter((n) => n.id !== edge.sourceId && n.id !== edge.targetId)
  .map((n) => ({ ...n, y: n.y + (deltaYById.get(n.id) ?? 0) }));
```

Remove the now-unused `EDGE_STUB`-adjacent constants only if they become unused (`TRACK_SPACING` and `TRACK_MARGIN` stay — they're still used by `channelGap`/`trackY`-adjacent sizing math that this task does not touch... re-check: if `trackY` itself is deleted because nothing else calls it, remove it; if `channelGap` still calls `tracksByChannel` independent of `trackY`, leave `channelGap` alone). Delete the `trackY` helper function and the `orderedChannels`/`trunkX` block entirely, since the router now finds the actual path.

- [ ] **Step 2: Add the import**

```typescript
import { createSequentialRouter } from '@bpm/layout-core';
```

- [ ] **Step 3: Run the swimlane package's own test suite**

Run: `npx vitest run packages/layout-engine-swimlane`
Expected: All tests pass. As in Task 6, if a test hard-codes exact intermediate coordinates from the old trunk-corridor logic, update it to assert the geometric property (no overlap, correct endpoints) instead.

- [ ] **Step 4: Run the crossing-regression suite again**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Expected: `nodeOverlaps: []` and `edgeThroughNode: []` still pass for every diagram. Record the actual `edgeCrossings` value printed/asserted for each diagram (temporarily loosen the assertion or log `result.edgeCrossings` to see it) — these become the new `BASELINE_CROSSINGS` in Task 8.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/src/laneBanding.ts
git commit -m "refactor(layout-engine-swimlane): route cross-lane edges via shared orthogonal router"
```

---

### Task 8: Re-baseline crossing regression and pin the three documented gap cases

> **Superseded for execution by** `docs/superpowers/plans/2026-08-10-unified-edge-router-resume.md` Task 8. Key correction: Task 7 measured identical baselines (0/0/0/0/1/9) — re-baseline is comment confirmation + gap fixtures, not assumed drops. STATUS claims must follow fixture evidence.

**Files:**
- Modify: `packages/layout-engine-swimlane/test/crossing-regression.test.ts`

**Interfaces:**
- Consumes: `analyzeLayout` from `@bpm/layout-core/test-utils/geometry`, `VERIFICATION_DIAGRAMS` from `@bpm/layout-core/test-utils/verificationDiagrams` (both unchanged).

- [ ] **Step 1: Measure actual crossing counts**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`

With the `BASELINE_CROSSINGS` assertions still pointing at the old (pre-migration) numbers from Task 7, read the actual-vs-expected values Vitest prints for each failing case.

- [ ] **Step 2: Update `BASELINE_CROSSINGS` to the measured values**

```typescript
// packages/layout-engine-swimlane/test/crossing-regression.test.ts
// Re-measured after replacing boundary-event and cross-lane channel routing with the shared
// orthogonal visibility-graph router (see docs/superpowers/specs/2026-08-09-unified-edge-router-design.md).
// node overlaps and edge-through-node remain fully clean.
const BASELINE_CROSSINGS: Record<string, number> = {
  screenshot: 0,             // placeholder — replace with the value measured in Step 1
  poolLaneTwoBoundary: 0,    // placeholder — replace with the value measured in Step 1
  fanOut: 0,                 // placeholder — replace with the value measured in Step 1
  nestedSubprocess: 0,       // placeholder — replace with the value measured in Step 1
  crowdedBoundary: 0,        // placeholder — replace with the value measured in Step 1
  orderToCashStacked: 0,     // placeholder — replace with the value measured in Step 1
};
```

Do not guess these numbers — copy them from the actual `analyzeLayout` output observed in Step 1. If any value is *higher* than the old baseline, stop and investigate before proceeding (a regression, not an improvement) rather than baselining it in.

- [ ] **Step 3: Add regression fixtures for the three documented gap cases**

Check whether `VERIFICATION_DIAGRAMS` (in `packages/layout-core/test-utils/verificationDiagrams.ts`) already exercises: (a) a boundary event whose host shares an x-column with another node directly below it, (b) two boundary-event doglegs needing to avoid the same obstacle at the same y-level, (c) the `layout: flat` boundary-edge-through-end-event case mentioned in `docs/STATUS.md`. Read that file first — `crowdedBoundary` and `orderToCashStacked` likely already cover some of these (they're named for exactly this kind of stress case). For whichever case(s) are not yet covered, add a new named entry to `VERIFICATION_DIAGRAMS` with a minimal diagram text that reproduces it, and a corresponding entry in `BASELINE_CROSSINGS`.

- [ ] **Step 4: Run the full suite one more time**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Expected: PASS — all `nodeOverlaps`/`edgeThroughNode` empty, all `edgeCrossings` match the newly-recorded baselines.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/test/crossing-regression.test.ts
git commit -m "test: re-baseline crossing regression after unified router migration"
```

---

### Task 9: Update `docs/STATUS.md` and run the full workspace test suite

> **Superseded for execution by** `docs/superpowers/plans/2026-08-10-unified-edge-router-resume.md` Task 9. Do **not** delete residual-crossing bullets unless Task 8 fixtures prove those cases clean — baselines did not drop after migration.

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Remove the now-fixed known limitations**

In the "Known limitations" section of `docs/STATUS.md`, remove the bullet describing residual edge-edge crossings from the two boundary-routing gaps and the `layout: flat` edge-through-node bullet **only if Task 8 fixtures prove them fixed** (re-read the current file to confirm exact wording before editing, since other unrelated limitations in that section must stay). Add a line noting the router replacement:

```markdown
- **Boundary-event and cross-lane channel edge routing** now goes through a shared orthogonal
  visibility-graph router (`@bpm/layout-core`'s `routeOrthogonal`/`createSequentialRouter`)
  instead of hand-rolled per-case detour logic, closing the previously-documented residual
  crossing gaps by construction. See `docs/superpowers/specs/2026-08-09-unified-edge-router-design.md`.
```

- [ ] **Step 2: Run the entire workspace test suite**

Run: `npm test`
Expected: All tests pass (previously 111/111 — the count will change slightly given new router tests were added; confirm 0 failures).

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: update STATUS.md for unified edge router"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1–4 build the router exactly as specced (visibility graph + Dijkstra + sequential obstacle accumulation, fallback to straight line). Task 5 wires it into the package's public API. Tasks 6–7 migrate both hand-rolled routing layers named in the spec's "Components touched" section, each preserving the anchor-point/gap-sizing logic the spec explicitly said to keep. Task 8 covers the spec's testing section (re-baseline + pin the three documented gap cases). Task 9 covers the spec's implicit requirement to keep `docs/STATUS.md` accurate.
- **Scope boundary respected:** no task touches ELK/Dagre/Graphviz native routing, `laneBanding.ts`'s lane-height/positioning math, or `test-utils/geometry.ts`.
- **Type consistency:** `SequentialRouter.route(start: Point, end: Point, obstacles: Rect[]): Point[]` is used identically in Task 6 and Task 7; `routeOrthogonal`'s signature matches its Task 4 definition everywhere it's referenced.
