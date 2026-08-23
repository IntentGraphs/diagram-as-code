import type { AgentPoint } from './diagramActions.js';

export interface RouteObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RoutePreference = 'direct' | 'top' | 'bottom' | 'left' | 'right';

function unique(points: AgentPoint[]): AgentPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function inflate(rect: RouteObstacle, margin: number): RouteObstacle {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 };
}

function segmentClear(a: AgentPoint, b: AgentPoint, obstacles: RouteObstacle[]): boolean {
  return obstacles.every((rect) => {
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    return xMax < rect.x || xMin > rect.x + rect.width || yMax < rect.y || yMin > rect.y + rect.height;
  });
}

function clear(points: AgentPoint[], obstacles: RouteObstacle[]): boolean {
  return points.slice(0, -1).every((point, index) => segmentClear(point, points[index + 1], obstacles));
}

export function candidateRoutes(start: AgentPoint, end: AgentPoint, obstacles: RouteObstacle[] = [], margin = 20): AgentPoint[][] {
  const inflated = obstacles.map((obstacle) => inflate(obstacle, margin));
  const xMid = (start.x + end.x) / 2;
  const yMid = (start.y + end.y) / 2;
  const top = Math.min(start.y, end.y, ...inflated.map((rect) => rect.y)) - margin;
  const bottom = Math.max(start.y, end.y, ...inflated.map((rect) => rect.y + rect.height)) + margin;
  const left = Math.min(start.x, end.x, ...inflated.map((rect) => rect.x)) - margin;
  const right = Math.max(start.x, end.x, ...inflated.map((rect) => rect.x + rect.width)) + margin;
  const candidates = [
    [start, end],
    [start, { x: xMid, y: start.y }, { x: xMid, y: end.y }, end],
    [start, { x: start.x, y: yMid }, { x: end.x, y: yMid }, end],
    [start, { x: start.x, y: top }, { x: end.x, y: top }, end],
    [start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end],
    [start, { x: left, y: start.y }, { x: left, y: end.y }, end],
    [start, { x: right, y: start.y }, { x: right, y: end.y }, end],
  ].map(unique);
  const clearCandidates = candidates.filter((points) => clear(points, inflated));
  return clearCandidates.length > 0 ? clearCandidates : candidates;
}

export function chooseRoute(start: AgentPoint, end: AgentPoint, obstacles: RouteObstacle[], preference: RoutePreference = 'direct'): AgentPoint[] {
  const candidates = candidateRoutes(start, end, obstacles);
  if (preference === 'direct') return candidates[0];
  const score = (route: AgentPoint[]): number => {
    if (preference === 'top') return Math.min(...route.map((point) => point.y));
    if (preference === 'bottom') return -Math.max(...route.map((point) => point.y));
    if (preference === 'left') return Math.min(...route.map((point) => point.x));
    return -Math.max(...route.map((point) => point.x));
  };
  return [...candidates].sort((a, b) => score(a) - score(b))[0] ?? [start, end];
}
