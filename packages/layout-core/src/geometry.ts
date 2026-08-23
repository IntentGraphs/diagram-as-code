import type { PositionedDiagram, PositionedNode, RoutedEdge } from './types.js';
import {
  segmentIntersectsRect,
  rectsOverlap,
  segmentsIntersect,
  overshootsAnchor,
  type LayoutAnalysis,
} from '@bpm/diagram-core';

export type { LayoutAnalysis } from '@bpm/diagram-core';

function flattenNodes(nodes: PositionedNode[], acc: PositionedNode[] = []): PositionedNode[] {
  for (const n of nodes) { acc.push(n); if (n.children) flattenNodes(n.children, acc); }
  return acc;
}
function flattenEdges(nodes: PositionedNode[], topEdges: RoutedEdge[], acc: RoutedEdge[] = []): RoutedEdge[] {
  acc.push(...topEdges);
  for (const n of nodes) { if (n.childEdges) acc.push(...n.childEdges); if (n.children) flattenEdges(n.children, [], acc); }
  return acc;
}
function isAncestor(maybeAncestor: PositionedNode, node: PositionedNode): boolean {
  if (!maybeAncestor.children) return false;
  for (const c of maybeAncestor.children) { if (c.id === node.id) return true; if (isAncestor(c, node)) return true; }
  return false;
}

export function analyzeLayout(positioned: PositionedDiagram): LayoutAnalysis {
  const nodes = flattenNodes(positioned.nodes);
  const edges = flattenEdges(positioned.nodes, positioned.edges);
  const nodeOverlaps: string[] = [];
  const edgeThroughNode: string[] = [];

  const containerOf = new Map<string, PositionedNode | null>();
  (function indexTree(list: PositionedNode[], parent: PositionedNode | null) {
    for (const n of list) { containerOf.set(n.id, parent); if (n.children) indexTree(n.children, n); }
  })(positioned.nodes, null);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (isAncestor(a, b) || isAncestor(b, a)) continue;
      if ((a as any).attachedToId === b.id || (b as any).attachedToId === a.id) continue;
      if (rectsOverlap(a, b)) nodeOverlaps.push(`"${a.label}" (${a.id}) overlaps "${b.label}" (${b.id})`);
    }
  }

  function isContainerOfEdge(container: PositionedNode, edge: RoutedEdge): boolean {
    const contains = (id: string) => {
      let cur = containerOf.get(id) ?? null;
      while (cur) { if (cur.id === container.id) return true; cur = containerOf.get(cur.id) ?? null; }
      return false;
    };
    return contains(edge.sourceId) && contains(edge.targetId);
  }

  for (const edge of edges) {
    for (const node of nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      if (node.children && isContainerOfEdge(node, edge)) continue;
      for (let k = 0; k < edge.points.length - 1; k++) {
        if (segmentIntersectsRect(edge.points[k], edge.points[k + 1], node)) {
          edgeThroughNode.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) passes through "${node.label}" (${node.id})`);
          break;
        }
      }
    }
  }

  const edgeOvershootsOwnEndpoint: string[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    if (edge.points.length < 2) continue;
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    if (sourceNode && overshootsAnchor(sourceNode, edge.points[1], edge.points[0])) {
      edgeOvershootsOwnEndpoint.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) cuts through its own source "${sourceNode.label}" (${sourceNode.id}) to reach its start point`);
    }
    const n = edge.points.length;
    if (targetNode && n >= 2 && overshootsAnchor(targetNode, edge.points[n - 2], edge.points[n - 1])) {
      edgeOvershootsOwnEndpoint.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) cuts through its own target "${targetNode.label}" (${targetNode.id}) to reach its end point`);
    }
  }

  let edgeCrossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i], e2 = edges[j];
      if (e1.sourceId === e2.sourceId || e1.sourceId === e2.targetId || e1.targetId === e2.sourceId || e1.targetId === e2.targetId) continue;
      for (let a = 0; a < e1.points.length - 1; a++) {
        for (let b = 0; b < e2.points.length - 1; b++) {
          if (segmentsIntersect(e1.points[a], e1.points[a + 1], e2.points[b], e2.points[b + 1])) edgeCrossings++;
        }
      }
    }
  }

  return { nodeOverlaps, edgeThroughNode, edgeCrossings, edgeOvershootsOwnEndpoint };
}
