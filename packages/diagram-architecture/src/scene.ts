import type { DiagramScene } from '@bpm/diagram-core';
import type { PositionedArchitecture, PositionedArchitectureNode } from './layout.js';

export function architectureScene(positioned: PositionedArchitecture): DiagramScene {
  const nodes: DiagramScene['nodes'] = [];
  const containers: DiagramScene['containers'] = [];
  const visit = (node: PositionedArchitectureNode): void => {
    const common = { id: node.id, kind: node.kind, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height, ...(node.parentId ? { parentId: node.parentId } : {}) };
    nodes.push(common);
    if (node.children.length) containers.push(common);
    node.children.forEach(visit);
  };
  positioned.nodes.forEach(visit);
  return {
    width: positioned.width,
    height: positioned.height,
    nodes,
    edges: positioned.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      points: edge.points,
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.labelRect ? { labelRect: edge.labelRect } : {}),
      ...(edge.routeStatus ? { routeStatus: edge.routeStatus } : {}),
    })),
    ...(containers.length ? { containers } : {}),
  };
}
