import type { DiagramScene } from '@bpm/diagram-core';
import type { PositionedDfd } from './layout.js';
export function dfdScene(positioned: PositionedDfd): DiagramScene {
  return { width: positioned.width, height: positioned.height, nodes: positioned.nodes.map((node) => ({ id: node.id, kind: node.kind, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height })), edges: positioned.edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, points: edge.points, label: edge.label })) };
}
