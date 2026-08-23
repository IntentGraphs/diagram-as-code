import {
  assertNoOverlaps as assertGenericNoOverlaps,
  describeOverlap as describeGenericOverlap,
  type Bounds,
} from '@bpm/diagram-core';
import type { PositionedNode } from './types.js';

function toBounds(node: PositionedNode): Bounds {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    children: node.children?.map(toBounds),
  };
}

/** Preserve the BPMN-facing layout-core signature while delegating the math. */
export function describeOverlap(a: PositionedNode, b: PositionedNode): string {
  return describeGenericOverlap(toBounds(a), toBounds(b));
}

/** Preserve the BPMN-facing layout-core signature while delegating the math. */
export function assertNoOverlaps(nodes: PositionedNode[]): void {
  assertGenericNoOverlaps(nodes.map(toBounds));
}
