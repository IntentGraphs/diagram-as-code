export interface Point {
  x: number;
  y: number;
}

export type EdgeCornerStyle = 'sharp' | 'round';

const CORNER_RADIUS = 10;

/** Sharp-cornered polyline: straight `L` segments through every point. */
function sharpPathD(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

/**
 * Cosmetic corner-rounding for an orthogonal polyline. This does not change the route;
 * it only changes how the existing points are drawn.
 */
function roundedPathD(points: Point[]): string {
  const usablePoints = points.filter((point, index) => (
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
  ));
  if (usablePoints.length < 3) return sharpPathD(usablePoints);
  const segments: string[] = [`M ${usablePoints[0].x} ${usablePoints[0].y}`];
  for (let index = 1; index < usablePoints.length - 1; index += 1) {
    const previous = usablePoints[index - 1];
    const corner = usablePoints[index];
    const next = usablePoints[index + 1];
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(CORNER_RADIUS, inLength / 2, outLength / 2);
    const before = {
      x: corner.x + (radius / inLength) * (previous.x - corner.x),
      y: corner.y + (radius / inLength) * (previous.y - corner.y),
    };
    const after = {
      x: corner.x + (radius / outLength) * (next.x - corner.x),
      y: corner.y + (radius / outLength) * (next.y - corner.y),
    };
    segments.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }
  const last = usablePoints[usablePoints.length - 1];
  segments.push(`L ${last.x} ${last.y}`);
  return segments.join(' ');
}

export function polylinePathD(points: Point[], corner: EdgeCornerStyle = 'sharp'): string {
  return corner === 'round' ? roundedPathD(points) : sharpPathD(points);
}

export function pointAlongPolyline(
  points: Point[],
  t: number,
): { x: number; y: number; tx: number; ty: number } {
  if (points.length === 0) throw new Error('pointAlongPolyline requires at least one point');
  const clamped = Math.min(1, Math.max(0, t));
  let total = 0;
  const segmentLengths: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    segmentLengths.push(length);
    total += length;
  }
  if (total === 0) return { x: points[0].x, y: points[0].y, tx: 1, ty: 0 };
  let distance = clamped * total;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    if (distance <= segmentLengths[index] || index === segmentLengths.length - 1) {
      const ratio = segmentLengths[index] === 0 ? 0 : distance / segmentLengths[index];
      const x = points[index].x + (points[index + 1].x - points[index].x) * ratio;
      const y = points[index].y + (points[index + 1].y - points[index].y) * ratio;
      const tx = points[index + 1].x - points[index].x;
      const ty = points[index + 1].y - points[index].y;
      return { x, y, tx, ty };
    }
    distance -= segmentLengths[index];
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, tx: 1, ty: 0 };
}
