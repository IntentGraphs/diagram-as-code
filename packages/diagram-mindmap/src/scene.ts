import type { DiagramScene } from '@bpm/diagram-core';
import type { PositionedMindmap, PositionedMindmapNode } from './layout.js';

export function mindmapScene(positioned: PositionedMindmap): DiagramScene {
  const nodes: DiagramScene['nodes'] = [];
  const visit = (node: PositionedMindmapNode, parentId?: string): void => {
    nodes.push({ id: node.id, kind: 'mindmapNode', label: node.label, x: node.x, y: node.y, width: node.width, height: node.height, ...(parentId ? { parentId } : {}) });
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(positioned.root);
  return { width: positioned.width, height: positioned.height, nodes, edges: positioned.edges.map((edge) => ({ id: edge.id, sourceId: edge.from, targetId: edge.to, points: edge.points })) };
}
