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

  it('stays connected when start and end share an axis and an obstacle blocks the direct line', () => {
    const start = { x: 0, y: 10 };
    const end = { x: 100, y: 10 };
    const obstacle = { x: 40, y: 0, width: 20, height: 20 };
    const graph = buildVisibilityGraph(start, end, [obstacle]);
    // A path must exist: run a simple BFS from index 0 (start) and confirm index 1 (end) is reachable.
    const visited = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const { to } of graph.adjacency[cur]) {
        if (!visited.has(to)) {
          visited.add(to);
          queue.push(to);
        }
      }
    }
    expect(visited.has(1)).toBe(true);
  });

  it('never creates an edge that cuts through an obstacle interior via boundary-projection points', () => {
    const start = { x: 0, y: 10 };
    const end = { x: 100, y: 10 };
    const obstacle = { x: 40, y: 0, width: 20, height: 20 };
    const graph = buildVisibilityGraph(start, end, [obstacle]);
    const leftProjection = graph.points.findIndex((p) => p.x === 40 && p.y === 10);
    const rightProjection = graph.points.findIndex((p) => p.x === 60 && p.y === 10);
    expect(leftProjection).toBeGreaterThanOrEqual(0);
    expect(rightProjection).toBeGreaterThanOrEqual(0);
    // These two points both sit at y=10, strictly inside the obstacle's y:0-20 span, on opposite
    // sides of it — a direct edge between them would cut straight through the interior.
    const leftNeighbors = graph.adjacency[leftProjection].map((e) => e.to);
    expect(leftNeighbors).not.toContain(rightProjection);
  });
});
