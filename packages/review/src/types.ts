import type { PositionedDiagram } from '@bpm/layout-core';
import type { ValidationResult } from '@bpm/validate';
import type { DiagramFamilyId } from '@bpm/diagram-runtime';
import type { ProviderRequestOptions } from './request.js';

export type FindingCategory =
  | 'label_clipping'
  | 'label_overlap'
  | 'edge_through_node'
  | 'edge_crossing'
  | 'crowding'
  | 'unbalanced_layout'
  | 'ambiguous_routing'
  | 'text_unreadable'
  | 'other';

export interface TextPatch {
  find: string;
  replace: string;
}

export interface VisualFinding {
  severity: 'error' | 'warning' | 'note';
  category: FindingCategory;
  nodeIds?: string[];
  edgeIds?: string[];
  message: string;
  suggestedFix?: string;
  confidence?: number;
  source: 'geometry' | 'model';
  patch?: TextPatch;
}

export interface ReviewBundle {
  family: DiagramFamilyId;
  text: string;
  validation: ValidationResult;
  positioned?: PositionedDiagram;
  svg?: string;
  png?: Uint8Array;
  meta: {
    nodes: Array<{ id: string; kind: string; label: string }>;
    edges: Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
  };
}

export interface DiagramReviewResult {
  family: DiagramFamilyId;
  validation: ValidationResult;
  visualFindings: VisualFinding[];
  providerId: string;
  png?: Uint8Array;
}

export type RepairStatus = 'valid' | 'budget_exhausted';

export interface DiagramRepairResult {
  family: DiagramFamilyId;
  status: RepairStatus;
  attempts: number;
  text: string;
  validation: ValidationResult;
  findings: VisualFinding[];
  providerId: string;
}

/** attempts counts repair passes only; the initial draft from generate() is attempt 0. */
export interface DiagramGenerateResult {
  family: DiagramFamilyId;
  status: RepairStatus;
  attempts: number;
  text: string;
  validation: ValidationResult;
  findings: VisualFinding[];
  providerId: string;
}

export interface ReviewProvider {
  readonly id: string;
  review(bundle: ReviewBundle, options?: ProviderRequestOptions): Promise<VisualFinding[]>;
  /** Text-only repair. Omit to skip (treated as no patches). */
  repair?(bundle: ReviewBundle, options?: ProviderRequestOptions): Promise<VisualFinding[]>;
  /** Draft a full .bpm source from a plain-language description. Omit to skip (treated as unsupported). */
  generate?(description: string, family?: DiagramFamilyId, options?: ProviderRequestOptions): Promise<string>;
}
