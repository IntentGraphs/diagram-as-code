export const DIAGRAM_FAMILIES = ['bpmn', 'mindmap', 'flowchart', 'architecture', 'gantt'] as const;

export type DiagramFamilyId = typeof DIAGRAM_FAMILIES[number];

import type { ValidationMetrics } from '@bpm/validate';
import type { GanttTimescale, PageSpec } from '@bpm/diagram-core';
import type { PaginatedScene } from '@bpm/diagram-core';
import type { DiagramDirection, DiagramSourceMap, LaneDirection, PageBreakStrategy, PaginationMode, RoutingMode } from '@bpm/ast';
export type { PageFit, PageSpec, PageUnit } from '@bpm/diagram-core';
export type { PageBreakStrategy, PaginationMode } from '@bpm/ast';
export type { GanttTimescale } from '@bpm/diagram-core';
export type { DiagramDirection, LaneDirection } from '@bpm/ast';

/** Controls whether the web editor may schedule live preview renders. */
export type RenderMode = 'auto' | 'manual';

export interface DiagramDiagnostic {
  line: number;
  column: number;
  message: string;
  code?: string;
  token?: string;
  supportedFamilies?: DiagramFamilyId[];
  severity?: 'error' | 'warning';
}

export interface FamilyParseResult<Ast> {
  ast: Ast;
  errors: DiagramDiagnostic[];
  semanticErrors: DiagramDiagnostic[];
  /** Optional non-blocking diagnostics discovered during family parsing/preflight. */
  warnings?: DiagramDiagnostic[];
  /** Optional semantic-id to source-declaration mapping for editor and workspace integrations. */
  sourceLocations?: DiagramSourceMap;
}

export interface FamilyValidationResult {
  valid: boolean;
  errors: DiagramDiagnostic[];
  semanticErrors: DiagramDiagnostic[];
  warnings: DiagramDiagnostic[];
  /** Common post-layout geometry metrics available for every built-in family. */
  metrics?: DiagramInspectionMetrics;
  /** Common post-layout geometry inspection available for every built-in family. */
  inspection?: DiagramInspection;
}

export interface DiagramInspectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramInspectionNode extends DiagramInspectionRect {
  id: string;
  kind: string;
  label: string;
  parentId?: string;
}

export interface DiagramInspectionEdge {
  id: string;
  sourceId: string;
  targetId: string;
  points: Array<{ x: number; y: number }>;
  label?: string;
  labelRect?: DiagramInspectionRect;
}

export interface DiagramInspectionIssue {
  code: 'node_overlap' | 'edge_through_node' | 'edge_crossing' | 'edge_overshoot' | 'lane_overlap' | 'lane_label_too_narrow' | 'route_degraded' | 'label_overlap' | 'bounds_overflow' | 'containment_violation';
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface DiagramInspectionMetrics {
  edgeCrossings: number;
  nodeOverlaps: number;
  edgeThroughNode: number;
  edgeOvershootsOwnEndpoint: number;
  routeFallbacks: number;
  degradedRoutes?: number;
  labelOverlaps?: number;
  boundsOverflows?: number;
  containmentViolations?: number;
}

export interface DiagramInspection {
  /** Flattened drawable nodes, including nested architecture/mindmap nodes. */
  nodes: DiagramInspectionNode[];
  /** Resolved drawable edge paths. */
  edges: DiagramInspectionEdge[];
  /** Optional family containers such as pools, lanes, or architecture groups. */
  containers?: DiagramInspectionNode[];
  contentBounds: DiagramInspectionRect;
  renderBounds: DiagramInspectionRect;
  metrics: DiagramInspectionMetrics;
  issues: {
    nodeOverlaps: string[];
    edgeThroughNode: string[];
    edgeOvershootsOwnEndpoint: string[];
    routeDegraded: string[];
    labelOverlaps: string[];
    boundsOverflows: string[];
    containmentViolations: string[];
  };
  issueDetails: DiagramInspectionIssue[];
}

export interface FamilyLayoutOptions {
  engineOverride?: string;
  direction?: DiagramDirection;
  laneDirection?: LaneDirection;
  routing?: RoutingMode;
}

/**
 * How a family's diagrams can be visually edited, distinct from `structuredExport`:
 * `'bpmn-js'` gets the in-app bpmn-js canvas; `'external-export'` only produces a
 * structured format editable in a *different* tool (e.g. draw.io/Mermaid, once those
 * exist); `'none'` means SVG/PNG only, no round-trippable editable form.
 */
export type FamilyEditorMode = 'bpmn-js' | 'external-export' | 'none';

export type StructuredExportFormatId = string;
export interface StructuredExportDescriptor {
  format: StructuredExportFormatId;
  label: string;
  mimeType: string;
  fileExtension: string;
  editable: boolean;
  externalEditor?: string;
  roundTrip: 'none' | 'full';
  fidelity: 'lossless' | 'lossy';
}

export interface FamilyCapabilities {
  svg: true;
  png: true;
  /** Whether the family has a tested native editable PowerPoint projection. */
  pptx?: boolean;
  structuredExport: string[];
  structuredExports?: StructuredExportDescriptor[];
  editorMode: FamilyEditorMode;
  /** Whether the adapter honors `FamilyLayoutOptions.engineOverride`; the runtime strips it otherwise. */
  engineOverride: boolean;
}

export interface AiCapabilities {
  /** Draft a full diagram source from a plain-language description. */
  generation: boolean;
  /** Text-only patch suggestions from a review provider when validate() is blocking. */
  repair: boolean;
  /** Render → send to a vision-capable provider for layout/legibility findings. */
  visualReview: boolean;
  /** Family-neutral geometry findings computed without a model call. */
  geometryInspection: boolean;
  /** The family's parser/adapter surfaces meaningful semanticErrors. */
  semanticValidation: boolean;
}

export const NO_AI_CAPABILITIES: AiCapabilities = {
  generation: false,
  repair: false,
  visualReview: false,
  geometryInspection: false,
  semanticValidation: false,
};

export interface AiUnsupportedResult {
  status: 'unsupported';
  family: DiagramFamilyId;
  operation: keyof AiCapabilities;
  message: string;
}

export interface AiValidationResult extends FamilyValidationResult {
  metrics?: ValidationMetrics;
}

export interface DiagramFamilyAdapter<Ast = unknown, Positioned = unknown> {
  id: DiagramFamilyId;
  parse(source: string): FamilyParseResult<Ast>;
  layout(ast: Ast, options?: FamilyLayoutOptions): Promise<Positioned>;
  render(positioned: Positioned): string;
  validate?(source: string, options?: FamilyLayoutOptions): Promise<FamilyValidationResult>;
  exportStructured?(ast: Ast, positioned: Positioned, format: string): string;
  capabilities: FamilyCapabilities;
  aiCapabilities?: AiCapabilities;
}

export interface DiagramHeader {
  family: DiagramFamilyId;
  sourceWithoutDirective: string;
  directiveLine?: number;
  directiveFamily?: string;
  bodyLine: number;
  bodyOffset: number;
  page?: PageSpec;
  paginate: PaginationMode;
  pageBreak?: PageBreakStrategy;
  timescale?: GanttTimescale;
  renderMode?: RenderMode;
  direction?: DiagramDirection;
  laneDirection?: LaneDirection;
  /** Internal provenance flags used to distinguish defaults from explicit directives. */
  directionSpecified?: boolean;
  laneDirectionSpecified?: boolean;
  diagnostics: DiagramDiagnostic[];
}

export interface ResolvedDiagramFamily<Ast = unknown, Positioned = unknown> {
  header: DiagramHeader;
  adapter: DiagramFamilyAdapter<Ast, Positioned>;
}

export interface ParsedDiagramSource<Ast = unknown, Positioned = unknown> extends ResolvedDiagramFamily<Ast, Positioned> {
  result: FamilyParseResult<Ast>;
}

export interface DiagramExecutionResult<Ast = unknown, Positioned = unknown> extends ParsedDiagramSource<Ast, Positioned> {
  positioned: Positioned | null;
  svg: string | null;
  diagnostics: DiagramDiagnostic[];
  /** Non-blocking diagnostics produced by pagination or export preparation. */
  warnings: DiagramDiagnostic[];
  routeFallbacks?: number;
  /** Present for families/modes that implement the shared multi-page contract. */
  paginated?: PaginatedScene;
}

/** Coarse progress phases reported by `executeDiagramSource`'s optional `onPhase` hook. */
export type DiagramExecutionPhase = 'parsing' | 'layout' | 'rendering';
