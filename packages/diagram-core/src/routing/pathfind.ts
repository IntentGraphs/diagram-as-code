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
      // Keep ties stable: graph construction is deterministic, and the lower predecessor
      // index gives equivalent paths a repeatable choice independent of insertion order.
      if (candidate < dist[to] || (candidate === dist[to] && (prev[to] === -1 || u < prev[to]))) {
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
