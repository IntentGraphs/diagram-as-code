import type { DiagramEdge, DiagramNode, Position } from '@bpm/ast';
import type { Point, Rect, SequentialRouter } from '@bpm/diagram-core';

export type WaypointValidationIssue = 'non-finite' | 'diagonal-segment' | 'obstacle-intersection';

export interface WaypointValidation {
  valid: boolean;
  issues: WaypointValidationIssue[];
}

/** Validates author-provided waypoints without changing their coordinate space. */
export function validateWaypointPath(points: Point[], obstacles: Rect[] = []): WaypointValidation {
  const issues = new Set<WaypointValidationIssue>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) issues.add('non-finite');
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) issues.add('diagonal-segment');
    if (obstacles.some((rect) =>
      !(Math.max(a.x, b.x) < rect.x || Math.min(a.x, b.x) > rect.x + rect.width ||
        Math.max(a.y, b.y) < rect.y || Math.min(a.y, b.y) > rect.y + rect.height))) {
      issues.add('obstacle-intersection');
    }
  }
  return { valid: issues.size === 0, issues: [...issues] };
}

/**
 * Interior of an edge path: explicit waypoints when present, otherwise the sequential router.
 * Callers still prepend the exit anchor and append the entry anchor.
 */
export function middleRoute(
  edge: DiagramEdge,
  exitStub: Point,
  entryStub: Point,
  obstacles: Rect[],
  router: SequentialRouter,
  mapWaypoint: (p: Position) => Point = (p) => p,
): Point[] {
  if (edge.waypoints && edge.waypoints.length > 0) {
    const waypoints = edge.waypoints.map(mapWaypoint);
    // Explicit vias are authored in diagram space and may intentionally approach an
    // endpoint diagonally (for example, a hand-authored bend leaving a circular event).
    // Validate the authored via chain itself; the endpoint docks remain the renderer's
    // responsibility and must not silently discard otherwise valid explicit geometry.
    const validation = validateWaypointPath(waypoints, obstacles);
    // Preserve legal explicit routes. Invalid author paths are safely re-routed rather than
    // allowing diagonal or obstacle-intersecting geometry to bypass the shared invariants.
    if (validation.valid) return waypoints;
    return router.route(exitStub, entryStub, obstacles);
  }
  return router.route(exitStub, entryStub, obstacles);
}

/** Map author-space waypoint using source node's at→placed delta when the source has a position. */
export function waypointMapper(
  sourceAst: DiagramNode | undefined,
  sourcePlaced: { x: number; y: number },
): (p: Position) => Point {
  if (!sourceAst?.position) return (p) => p;
  const dx = sourcePlaced.x - sourceAst.position.x;
  const dy = sourcePlaced.y - sourceAst.position.y;
  return (p) => ({ x: p.x + dx, y: p.y + dy });
}
