import type { DiagramNode, DiagramEdge, Side } from '@bpm/ast';

interface PositionedNodeFields {
  x: number;
  y: number;
  width: number;
  height: number;
  children?: PositionedNode[];
  childEdges?: RoutedEdge[];
}

export type PositionedNode = DiagramNode extends infer Node
  ? Node extends DiagramNode
    ? Omit<Node, 'children' | 'childEdges'> & PositionedNodeFields
    : never
  : never;

export interface RoutedEdge extends DiagramEdge {
  points: Array<{ x: number; y: number }>;
  /** Resolved final sides from the renderer-facing route, when available. */
  resolvedFrom?: Side;
  resolvedTo?: Side;
  /** Resolved along-side offsets from the renderer-facing route, when non-central. */
  resolvedFromOffset?: number;
  resolvedToOffset?: number;
}

export interface PositionedLane {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedPool {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lanes: PositionedLane[];
}

export interface PositionedDiagram {
  pools: PositionedPool[];
  nodes: PositionedNode[];
  edges: RoutedEdge[];
}
