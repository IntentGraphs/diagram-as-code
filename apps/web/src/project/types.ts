import type { DiagramFamilyId } from '@bpm/diagram-runtime';

export type DiagramKind = 'text';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeDiagramId: string | null;
  family?: DiagramFamilyId;
}

export interface StoredDiagram {
  id: string;
  projectId: string;
  name: string;
  kind: DiagramKind;
  body: string;
  /** Latest BPMN XML snapshot for the visual editor, when one exists. */
  diagramXml?: string;
  createdAt: string;
  updatedAt: string;
  family?: DiagramFamilyId;
}

/** Persisted, validated text-mode render snapshot used to restore previews without rerunning layout. */
export interface StoredRenderSnapshot {
  key: string;
  projectId: string;
  diagramId: string;
  sourceHash: string;
  engineOverride: string | null;
  rendererVersion: string;
  result: unknown;
  updatedAt: string;
}

export interface SessionMeta {
  activeProjectId: string;
  activeDiagramId: string;
}

export interface SessionState {
  project: Project;
  diagrams: StoredDiagram[];
  activeDiagram: StoredDiagram;
}

export interface ProjectSeedDiagram {
  name: string;
  body: string;
}

export interface ProjectSeed {
  name: string;
  diagrams: readonly ProjectSeedDiagram[];
}

export const PROJECT_BUNDLE_FORMAT = 'bpm-project' as const;
export const PROJECT_BUNDLE_VERSION = 1 as const;

export interface ProjectBundleDiagram {
  id: string;
  name: string;
  kind: DiagramKind;
  /** The source as edited by the user at export time. */
  source: string;
  /** A source snapshot suitable for replay when auto-layout was used. */
  replaySource?: string;
  /** BPMN XML snapshot, including live visual edits when saved from Diagram mode. */
  diagramXml?: string;
  diagramXmlOrigin?: 'source-render' | 'diagram-editor';
  family?: DiagramFamilyId;
  createdAt: string;
  updatedAt: string;
  render?: {
    engine: string | null;
    positioning: 'auto' | 'manual';
    svg: string;
    positioned: unknown;
  };
  renderDiagnostics?: string[];
}

export interface ProjectBundle {
  format: typeof PROJECT_BUNDLE_FORMAT;
  version: typeof PROJECT_BUNDLE_VERSION;
  exportedAt: string;
  activeDiagramId: string | null;
  project: Project;
  diagrams: ProjectBundleDiagram[];
}
