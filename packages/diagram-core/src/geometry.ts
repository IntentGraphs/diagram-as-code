export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Liang-Barsky segment-vs-AABB, shrinking the rect by (marginX, marginY) on each side first. */
export function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: Rect,
  marginX = 3,
  marginY = 3,
): boolean {
  const rx = rect.x + marginX;
  const ry = rect.y + marginY;
  const rw = rect.width - 2 * marginX;
  const rh = rect.height - 2 * marginY;
  if (rw <= 0 || rh <= 0) return false;

  let t0 = 0;
  let t1 = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const checks: Array<[number, number]> = [
    [-dx, p1.x - rx],
    [dx, rx + rw - p1.x],
    [-dy, p1.y - ry],
    [dy, ry + rh - p1.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function inflateRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + 2 * margin,
    height: rect.height + 2 * margin,
  };
}

/** True if two axis-independent rects overlap by more than `margin` on both axes. */
export function rectsOverlap(a: Rect, b: Rect, margin = 2): boolean {
  return !(
    a.x + a.width - margin <= b.x || b.x + b.width - margin <= a.x ||
    a.y + a.height - margin <= b.y || b.y + b.height - margin <= a.y
  );
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True if open segments p1-p2 and p3-p4 cross (shared endpoints don't count as a crossing). */
export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * True if a segment that approaches `anchor` (a point on `rect`'s border) from `approach`
 * actually arrives from outside the rect along that border's outward axis, rather than
 * cutting across the rect's own interior to reach a far-side anchor point.
 */
export function overshootsAnchor(rect: Rect, approach: Point, anchor: Point): boolean {
  const onLeft = anchor.x === rect.x;
  const onRight = anchor.x === rect.x + rect.width;
  const onTop = anchor.y === rect.y;
  const onBottom = anchor.y === rect.y + rect.height;
  if (onLeft && approach.y === anchor.y) return approach.x > rect.x;
  if (onRight && approach.y === anchor.y) return approach.x < rect.x + rect.width;
  if (onTop && approach.x === anchor.x) return approach.y > rect.y;
  if (onBottom && approach.x === anchor.x) return approach.y < rect.y + rect.height;
  return false;
}
