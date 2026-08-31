import type { DiagramScene } from '@bpm/diagram-core';
import type { PositionedGantt } from './layout.js';

export function ganttScene(positioned: PositionedGantt): DiagramScene {
  // Gantt group rows organize tasks semantically but are header bands, not
  // geometric containers around the task bars, so they do not become parentId
  // relationships in the inspection scene.
  const nodes = positioned.rows.map((row) => ({ id: row.id, kind: row.kind, label: row.label, x: row.x, y: row.y, width: row.width, height: row.height }));
  const containers = nodes.filter((node) => node.kind === 'group');
  return { width: positioned.width, height: positioned.height, nodes, edges: positioned.dependencies.map((edge) => ({ id: edge.id, sourceId: edge.from, targetId: edge.to, points: edge.points })), ...(containers.length ? { containers } : {}) };
}
