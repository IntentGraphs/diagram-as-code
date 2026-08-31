export const DFD_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export type DfdNodeKind = 'external' | 'process' | 'dataStore';
export interface DfdNode { kind: DfdNodeKind; id: string; label: string; line: number; }
export interface DfdEdge { id: string; sourceId: string; targetId: string; label: string; line: number; }
export interface DfdDiagram { kind: 'dfdDiagram'; nodes: DfdNode[]; edges: DfdEdge[]; page?: import('@bpm/diagram-core').PageSpec; direction?: import('@bpm/ast').DiagramDirection; }
