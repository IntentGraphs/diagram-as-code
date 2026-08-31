import type { DiagramScene } from '@bpm/diagram-core';
import type { PositionedFlowchart } from './layout.js';

export function flowchartScene(positioned: PositionedFlowchart): DiagramScene {
  return { width: positioned.width, height: positioned.height, nodes: positioned.nodes.map((node) => ({ id: node.id, kind: node.kind, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height })), edges: positioned.edges.map((edge) => ({ id: edge.id, kind: edge.kind, sourceId: edge.from, targetId: edge.to, points: edge.points, ...(edge.label ? { label: edge.label } : {}) })) };
}
