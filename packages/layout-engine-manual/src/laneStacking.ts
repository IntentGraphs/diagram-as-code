import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedNode, PositionedPool, PositionedLane } from '@bpm/layout-core';

const LANE_PADDING = 20;
const POOL_TOP_PADDING = 12;
const POOL_X = 0;

export interface StackedPool {
  positionedPool: PositionedPool;
  placedNodes: PositionedNode[];
}

export function stackLanes(
  diagram: Diagram,
  placeNode: (node: DiagramNode, originX: number, originY: number) => PositionedNode,
): StackedPool[] {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  let poolOriginY = 0;

  return diagram.pools.map((pool) => {
    let currentY = poolOriginY + POOL_TOP_PADDING;
    const lanes: PositionedLane[] = [];
    const placedNodes: PositionedNode[] = [];
    let poolContentWidth = 0;

    for (const lane of pool.lanes) {
      const laneNodes = lane.nodeIds
        .map((id) => nodeById.get(id))
        .filter((n): n is DiagramNode => Boolean(n))
        // Boundary events are attached after layout by positionBoundaryEvents — never placeNode'd.
        .filter((n) => !(n.kind === 'event' && n.attachedToId !== undefined));
      const laneOriginY = currentY;
      const placed = laneNodes.map((n) => placeNode(n, POOL_X, laneOriginY));

      const contentBottom = placed.length > 0 ? Math.max(...placed.map((n) => n.y - laneOriginY + n.height)) : 0;
      const contentRight = placed.length > 0 ? Math.max(...placed.map((n) => n.x - POOL_X + n.width)) : 0;
      const laneHeight = contentBottom + LANE_PADDING * 2;
      poolContentWidth = Math.max(poolContentWidth, contentRight);

      lanes.push({ id: lane.id, name: lane.name, x: POOL_X, y: laneOriginY, width: 0, height: laneHeight });
      placedNodes.push(...placed);
      currentY += laneHeight;
    }

    const poolWidth = poolContentWidth + LANE_PADDING * 2;
    const finalLanes = lanes.map((l) => ({ ...l, width: poolWidth }));
    const positionedPool: PositionedPool = {
      id: pool.id, name: pool.name, x: POOL_X, y: poolOriginY, width: poolWidth, height: currentY - poolOriginY, lanes: finalLanes,
    };
    poolOriginY = currentY + LANE_PADDING;

    return {
      positionedPool,
      placedNodes,
    };
  });
}
