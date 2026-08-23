import type { DiagramNode, Side } from '@bpm/ast';
import {
  outlineAnchor as genericOutlineAnchor,
  outlinePort as genericOutlinePort,
  type AnchorShape,
  type Point,
  type Rect,
} from '@bpm/diagram-core';

export { facingSides, sideOf, sidePort, stubFrom } from '@bpm/diagram-core';

export function portOnShape(node: (DiagramNode & Rect) | Rect, side: Side, offset = 0, delta = 0): Point {
  const kind = 'kind' in node ? node.kind : undefined;
  const shape: AnchorShape = kind === 'event' ? 'circle' : kind === 'gateway' ? 'diamond' : 'rect';
  return genericOutlinePort(node, side, shape, offset, delta);
}

/**
 * Return the outline intersection in the direction of the other endpoint.
 * Rectangles retain their ordinary border intersection; events and gateways use
 * their actual circle/diamond outline instead of the enclosing-box midpoint.
 */
export function outlineAnchor(node: (DiagramNode & Rect) | Rect, side: Side, toward?: Point, delta = 0): Point {
  const kind = 'kind' in node ? node.kind : undefined;
  const shape: AnchorShape = kind === 'event' ? 'circle' : kind === 'gateway' ? 'diamond' : 'rect';
  return genericOutlineAnchor(node, side, shape, toward, delta);
}
