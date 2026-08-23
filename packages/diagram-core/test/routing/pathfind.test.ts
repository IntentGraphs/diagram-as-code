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
