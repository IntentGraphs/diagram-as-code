export const ARCHITECTURE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const ARCHITECTURE_NODE_KINDS = ['person', 'system', 'container', 'component', 'database', 'queue'] as const;
export type ArchitectureNodeKind = typeof ARCHITECTURE_NODE_KINDS[number];

export interface ArchitectureNode {
  kind: ArchitectureNodeKind;
  id: string;
  label: string;
  line: number;
  children: ArchitectureNode[];
}

export interface ArchitectureEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  line: number;
}

export interface ArchitectureDiagram {
  kind: 'architectureDiagram';
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  page?: import('@bpm/diagram-core').PageSpec;
  direction?: import('@bpm/ast').DiagramDirection;
}
