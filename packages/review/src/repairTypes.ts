export interface TextPatch {
  find: string;
  replace: string;
}

export interface RepairSuggestion {
  message: string;
  patch: TextPatch;
  confidence?: number;
}

export interface RepairBundle {
  text: string;
  validation: import('@bpm/validate').ValidationResult;
  attempt: number;
}

export interface RepairProvider {
  readonly id: string;
  suggestRepairs(bundle: RepairBundle, options?: import('./request.js').ProviderRequestOptions): Promise<RepairSuggestion[]>;
}

export interface RepairDiagramResult {
  family: DiagramFamilyId;
  originalText: string;
  repairedText: string;
  valid: boolean;
  attempts: number;
  validation: import('@bpm/validate').ValidationResult;
  appliedPatches: Array<{ patch: TextPatch; message: string }>;
  providerId: string;
}
import type { DiagramFamilyId } from '@bpm/diagram-runtime';
