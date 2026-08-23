import type { AgentDiagramState, AgentEdgeSnapshot, AgentGeometryReport, AgentNodeSnapshot, AgentPoint } from './diagramActions.js';

interface Rect { x: number; y: number; width: number; height: number }

function isContainer(node: AgentNodeSnapshot): boolean {
  return node.container || node.type === 'bpmn:Participant' || node.type === 'bpmn:Lane' || node.type === 'bpmn:SubProcess';
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function orientation(a: AgentPoint, b: AgentPoint, c: AgentPoint): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return value === 0 ? 0 : value > 0 ? 1 : 2;
}

function onSegment(a: AgentPoint, b: AgentPoint, c: AgentPoint): boolean {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x) && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(a: AgentPoint, b: AgentPoint, c: AgentPoint, d: AgentPoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d));
}

function segmentIntersectsRect(a: AgentPoint, b: AgentPoint, rect: Rect): boolean {
  if ((a.x >= rect.x && a.x <= rect.x + rect.width && a.y >= rect.y && a.y <= rect.y + rect.height)
    || (b.x >= rect.x && b.x <= rect.x + rect.width && b.y >= rect.y && b.y <= rect.y + rect.height)) return true;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  return segmentsIntersect(a, b, topLeft, topRight)
    || segmentsIntersect(a, b, topRight, bottomRight)
    || segmentsIntersect(a, b, bottomRight, bottomLeft)
    || segmentsIntersect(a, b, bottomLeft, topLeft);
}

function edgeSegments(edge: AgentEdgeSnapshot): Array<[AgentPoint, AgentPoint]> {
  return edge.points.slice(0, -1).map((point, index) => [point, edge.points[index + 1]]);
}

function edgeCrosses(edgeA: AgentEdgeSnapshot, edgeB: AgentEdgeSnapshot): boolean {
  if (edgeA.id === edgeB.id || edgeA.sourceId === edgeB.sourceId || edgeA.sourceId === edgeB.targetId
    || edgeA.targetId === edgeB.sourceId || edgeA.targetId === edgeB.targetId) return false;
  return edgeSegments(edgeA).some(([a, b]) => edgeSegments(edgeB).some(([c, d]) => segmentsIntersect(a, b, c, d)));
}

export function inspectAgentGeometry(state: AgentDiagramState): AgentGeometryReport {
  const nodes = state.nodes.filter((node) => !isContainer(node));
  const nodeOverlaps: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(nodes[i], nodes[j])) nodeOverlaps.push(`${nodes[i].id}:${nodes[j].id}`);
    }
  }

  const nodeById = new Map(state.nodes.map((node) => [node.id, node]));
  const edgeThroughNode: string[] = [];
  const nonOrthogonalEdges: string[] = [];
  const endpointErrors: string[] = [];
  for (const edge of state.edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target || edge.points.length < 2) {
      endpointErrors.push(edge.id);
      continue;
    }
    if (edge.points.some((point, index) => index > 0 && point.x !== edge.points[index - 1].x && point.y !== edge.points[index - 1].y)) {
      nonOrthogonalEdges.push(edge.id);
    }
    for (const node of nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      if (edgeSegments(edge).some(([a, b]) => segmentIntersectsRect(a, b, node))) {
        edgeThroughNode.push(edge.id);
        break;
      }
    }
  }

  const edgeCrossings: string[] = [];
  for (let i = 0; i < state.edges.length; i++) {
    for (let j = i + 1; j < state.edges.length; j++) {
      if (edgeCrosses(state.edges[i], state.edges[j])) edgeCrossings.push(`${state.edges[i].id}:${state.edges[j].id}`);
    }
  }
  return {
    nodeOverlaps,
    edgeThroughNode,
    edgeCrossings,
    endpointErrors,
    nonOrthogonalEdges,
    hardValid: nodeOverlaps.length === 0 && edgeThroughNode.length === 0 && endpointErrors.length === 0,
  };
}

export function routePenalty(report: AgentGeometryReport): number {
  return report.nodeOverlaps.length * 10_000
    + report.edgeThroughNode.length * 10_000
    + report.endpointErrors.length * 10_000
    + report.edgeCrossings.length * 1_000
    + report.nonOrthogonalEdges.length * 500;
}
