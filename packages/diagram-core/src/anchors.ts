import type { Point, Rect } from './geometry.js';

export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Shape of a node's outline, for anchor-point math: a plain rectangle, or a circle/diamond
 *  inscribed in its bounding box. Families map their own node-kind vocabulary onto this. */
export type AnchorShape = 'rect' | 'circle' | 'diamond';

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Pick the facing sides using both axes, so vertically stacked nodes dock top/bottom. */
export function facingSides(source: Rect, target: Rect): { from: Side; to: Side } {
  const a = center(source);
  const b = center(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

/**
 * Midpoint of the given border of `rect`. `delta` shifts the y-coordinate before computing —
 * used by swimlane cross-lane routing, where a node's final banded y isn't written back onto
 * the node object until after every edge in the pool has been routed.
 */
export function sideOf(rect: Rect, side: Side, delta = 0): Point {
  return sidePort(rect, side, 0, delta);
}

/**
 * Return a point on a border at a stable along-side offset from its midpoint.
 * Negative offsets move toward the top/left end of a side and positive offsets
 * toward the bottom/right end. Offsets are clamped to the border so small
 * shapes cannot produce anchors outside their outline.
 */
export function sidePort(rect: Rect, side: Side, offset = 0, delta = 0): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2 + delta;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const clamped = Math.max(-sideLength(rect, side) / 2, Math.min(sideLength(rect, side) / 2, safeOffset));
  switch (side) {
    case 'left': return { x: rect.x, y: cy + clamped };
    case 'right': return { x: rect.x + rect.width, y: cy + clamped };
    case 'top': return { x: cx + clamped, y: rect.y + delta };
    case 'bottom': return { x: cx + clamped, y: rect.y + rect.height + delta };
  }
}

/**
 * Return a stable port on the actual outline of a shape. Rectangles keep the
 * side-port coordinate; circles and diamonds project the offset direction onto
 * their real outline so an offset port cannot float outside or cut through the
 * rendered shape.
 */
export function outlinePort(rect: Rect, side: Side, shape: AnchorShape = 'rect', offset = 0, delta = 0): Point {
  const shifted: Rect = { x: rect.x, y: rect.y + delta, width: rect.width, height: rect.height };
  const candidate = sidePort(shifted, side, offset);
  return shape === 'rect' ? candidate : outlineAnchor(shifted, side, shape, candidate);
}

function sideLength(rect: Rect, side: Side): number {
  return side === 'left' || side === 'right' ? Math.max(0, rect.height) : Math.max(0, rect.width);
}

/** A point offset `distance` outward from `point`, in the direction implied by `side`. */
export function stubFrom(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case 'left': return { x: point.x - distance, y: point.y };
    case 'right': return { x: point.x + distance, y: point.y };
    case 'top': return { x: point.x, y: point.y - distance };
    case 'bottom': return { x: point.x, y: point.y + distance };
  }
}

/**
 * Return the outline intersection in the direction of the other endpoint.
 * `rect`'s ordinary border intersection is used for shape `'rect'`; `'circle'`/`'diamond'`
 * use the actual circle/diamond outline inscribed in `rect` instead of the enclosing-box
 * midpoint.
 */
export function outlineAnchor(rect: Rect, side: Side, shape: AnchorShape = 'rect', toward?: Point, delta = 0): Point {
  const offsetRect: Rect = { x: rect.x, y: rect.y + delta, width: rect.width, height: rect.height };
  const c = center(offsetRect);
  const direction = toward
    ? { x: toward.x - c.x, y: toward.y - c.y }
    : ({ left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }[side]);
  const dx = direction.x;
  const dy = direction.y;
  if (dx === 0 && dy === 0) return sideOf(offsetRect, side, 0);
  const halfW = offsetRect.width / 2;
  const halfH = offsetRect.height / 2;
  if (shape !== 'circle' && shape !== 'diamond') return sideOf(offsetRect, side, 0);
  let scale = Math.min(
    Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY,
    Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );
  if (shape === 'circle') {
    scale = 1 / Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2);
  } else {
    scale = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH);
  }
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}
