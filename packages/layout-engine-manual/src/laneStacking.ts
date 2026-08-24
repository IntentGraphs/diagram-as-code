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
    const poolOriginX = pool.position?.x ?? POOL_X;
    const resolvedPoolY = pool.position?.y ?? poolOriginY;
    let currentY = resolvedPoolY + POOL_TOP_PADDING;
    const lanes: PositionedLane[] = [];
    const placedNodes: PositionedNode[] = [];
    let poolContentWidth = 0;

    for (const lane of pool.lanes) {
      const laneNodes = lane.nodeIds
        .map((id) => nodeById.get(id))
        .filter((n): n is DiagramNode => Boolean(n))
        // Boundary events are attached after layout by positionBoundaryEvents — never placeNode'd.
        .filter((n) => !(n.kind === 'event' && n.attachedToId !== undefined));
      const laneOriginX = lane.position?.x ?? poolOriginX;
      const laneOriginY = lane.position?.y ?? currentY;
      const placed = laneNodes.map((n) => placeNode(n, laneOriginX, laneOriginY));

      const contentBottom = placed.length > 0 ? Math.max(...placed.map((n) => n.y - laneOriginY + n.height)) : 0;
      const contentRight = placed.length > 0 ? Math.max(...placed.map((n) => n.x - poolOriginX + n.width)) : 0;
      const laneHeight = lane.sizeHint?.height ?? contentBottom + LANE_PADDING * 2;
      poolContentWidth = Math.max(poolContentWidth, contentRight);

      lanes.push({
        id: lane.id,
        name: lane.name,
        x: laneOriginX,
        y: laneOriginY,
        width: lane.sizeHint?.width ?? 0,
        height: laneHeight,
      });
      placedNodes.push(...placed);
      currentY += laneHeight;
    }

    const poolWidth = pool.sizeHint?.width ?? poolContentWidth + LANE_PADDING * 2;
    const finalLanes = lanes.map((l) => ({ ...l, width: l.width || poolWidth }));
    const positionedPool: PositionedPool = {
      id: pool.id,
      name: pool.name,
      x: poolOriginX,
      y: resolvedPoolY,
      width: poolWidth,
      height: pool.sizeHint?.height ?? currentY - resolvedPoolY,
      lanes: finalLanes,
    };
    poolOriginY = pool.position?.y === undefined
      ? currentY + LANE_PADDING
      : resolvedPoolY + positionedPool.height + LANE_PADDING;

    return {
      positionedPool,
      placedNodes,
    };
  });
}
