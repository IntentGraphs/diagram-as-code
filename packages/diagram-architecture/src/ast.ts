export const ARCHITECTURE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const ARCHITECTURE_NODE_KINDS = ['person', 'system', 'container', 'component', 'database', 'queue'] as const;
export type ArchitectureNodeKind = typeof ARCHITECTURE_NODE_KINDS[number];
export const ARCHITECTURE_VIEW_TYPES = ['systemContext', 'systemLandscape', 'container', 'component', 'deployment', 'dynamic', 'custom'] as const;
export type ArchitectureViewType = typeof ARCHITECTURE_VIEW_TYPES[number];
export type ArchitectureThemeName = 'default' | 'high-contrast';

export interface ArchitectureView {
  key: string;
  type: ArchitectureViewType;
  focusId?: string;
  include?: string[];
  exclude?: string[];
  direction?: import('@bpm/ast').DiagramDirection;
  fit?: import('@bpm/diagram-core').PageFit;
  theme?: ArchitectureThemeName;
  title?: string;
  description?: string;
  line?: number;
}

export interface ArchitectureNode {
  kind: ArchitectureNodeKind;
  id: string;
  label: string;
  line: number;
  description?: string;
  technology?: string;
  tags?: string[];
  external?: boolean;
  group?: string;
  children: ArchitectureNode[];
}

export interface ArchitectureEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  technology?: string;
  protocol?: string;
  tags?: string[];
  line: number;
}

export interface ArchitectureDiagram {
  kind: 'architectureDiagram';
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  page?: import('@bpm/diagram-core').PageSpec;
  direction?: import('@bpm/ast').DiagramDirection;
  title?: string;
  description?: string;
  theme?: ArchitectureThemeName;
  legend?: boolean;
  views?: ArchitectureView[];
  activeView?: string;
}
