import type { Point } from './geometry.js';

export type SegmentInteraction = 'none' | 'proper-crossing' | 'endpoint-touch' | 'collinear-overlap';

/** Classifies segment interactions that strict crossing tests intentionally distinguish. */
export function classifySegmentInteraction(a: Point, b: Point, c: Point, d: Point): SegmentInteraction {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const on = (p: Point, q: Point, r: Point) =>
    cross(p, q, r) === 0 && r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) &&
    r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  if (abC === 0 && abD === 0 && cdA === 0 && cdB === 0) {
    const overlapX = Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
    const overlapY = Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
    return overlapX > 0 || overlapY > 0 ? 'collinear-overlap' : (on(a, b, c) || on(a, b, d) ? 'endpoint-touch' : 'none');
  }
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 'proper-crossing';
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b) ? 'endpoint-touch' : 'none';
}

/** Geometry issues found by comparing a diagram's resolved node/edge positions against
 *  each other — node-node overlaps, edges crossing through unrelated nodes, edges crossing
 *  each other, and edges overshooting their own endpoint node's border. */
export interface LayoutAnalysis {
  nodeOverlaps: string[];
  edgeThroughNode: string[];
  edgeCrossings: number;
  edgeOvershootsOwnEndpoint: string[];
}

export type LayoutIssueCode =
  | 'node_overlap'
  | 'edge_through_node'
  | 'edge_crossing'
  | 'edge_overshoot';

/** Machine-readable geometry issue metadata for repair agents and visual-review adapters. */
export interface LayoutIssue {
  code: LayoutIssueCode;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

/** Extracts structured node/edge ids out of `analyzeLayout`'s human-readable messages. */
export function issueDetailsFor(analysis: LayoutAnalysis): LayoutIssue[] {
  const details: LayoutIssue[] = [];
  for (const message of analysis.nodeOverlaps) {
    const ids = [...message.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
    details.push({ code: 'node_overlap', message, ...(ids.length ? { nodeIds: ids } : {}) });
  }
  for (const message of analysis.edgeThroughNode) {
    const edge = message.match(/^edge\s+([^\s]+)\s+\(([^>]+)->([^\)]+)\)/);
    const node = message.match(/\(([^()]+)\)\s*$/);
    details.push({
      code: 'edge_through_node',
      message,
      ...(edge ? { edgeIds: [edge[1]], nodeIds: [edge[2], edge[3], ...(node ? [node[1]] : [])] } : {}),
    });
  }
  for (const message of analysis.edgeOvershootsOwnEndpoint) {
    const edge = message.match(/^edge\s+([^\s]+)\s+\(([^>]+)->([^\)]+)\)/);
    const node = message.match(/\(([^()]+)\)\s*to reach its (?:start|end) point$/);
    details.push({
      code: 'edge_overshoot',
      message,
      ...(edge ? { edgeIds: [edge[1]], nodeIds: [edge[2], edge[3], ...(node ? [node[1]] : [])] } : {}),
    });
  }
  if (analysis.edgeCrossings > 0) {
    details.push({
      code: 'edge_crossing',
      message: `${analysis.edgeCrossings} edge-edge crossing(s) detected`,
    });
  }
  return details;
}

/** Manhattan length of a resolved edge's point sequence. */
export function edgeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

/** Number of direction changes in a resolved edge's point sequence (collinear points don't count). */
export function bendCount(points: Point[]): number {
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

/** True if every consecutive pair of points shares an x or y coordinate (axis-aligned throughout). */
export function isOrthogonal(points: Point[]): boolean {
  return points.every((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return point.x === previous.x || point.y === previous.y;
  });
}
