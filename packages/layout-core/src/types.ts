import type { DiagramNode, DiagramEdge } from '@bpm/ast';

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
