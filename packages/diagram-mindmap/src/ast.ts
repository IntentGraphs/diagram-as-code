export const MINDMAP_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export interface MindmapNode {
  kind: 'mindmapNode';
  id: string;
  label: string;
  hasExplicitLabel: boolean;
  depth: number;
  children: MindmapNode[];
  line: number;
}

export interface MindmapDiagram {
  kind: 'mindmapDiagram';
  root: MindmapNode;
  nodeCount: number;
  maxDepth: number;
  page?: import('@bpm/diagram-core').PageSpec;
  direction?: import('@bpm/ast').DiagramDirection;
}
