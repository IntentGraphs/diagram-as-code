export const FLOWCHART_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export type FlowchartNodeKind = 'box' | 'decision';
export interface FlowchartNode { kind: FlowchartNodeKind; id: string; label: string; line: number; }
export type FlowchartEdgeKind = 'sequence' | 'conditionalSequence' | 'defaultSequence';
export interface FlowchartEdge { kind: FlowchartEdgeKind; from: string; to: string; label?: string; line: number; }
export interface FlowchartDiagram { kind: 'flowchartDiagram'; nodes: FlowchartNode[]; edges: FlowchartEdge[]; page?: import('@bpm/diagram-core').PageSpec; direction?: import('@bpm/ast').DiagramDirection; }
