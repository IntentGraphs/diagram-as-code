import type { Point, Rect } from './geometry.js';

/** Family-neutral positioned representation consumed by inspection and integrations. */
export interface DiagramSceneNode extends Rect {
  id: string;
  kind: string;
  label: string;
  parentId?: string;
}

export interface DiagramSceneEdge {
  id: string;
  sourceId: string;
  targetId: string;
  points: Point[];
  kind?: string;
  label?: string;
  labelRect?: Rect;
  routeStatus?: string;
}

export interface DiagramSceneContainer extends Rect {
  id: string;
  kind: string;
  label: string;
  parentId?: string;
}

export interface DiagramScene {
  width: number;
  height: number;
  nodes: DiagramSceneNode[];
  edges: DiagramSceneEdge[];
  containers?: DiagramSceneContainer[];
}
