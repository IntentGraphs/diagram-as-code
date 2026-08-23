import { getFamily, NO_AI_CAPABILITIES } from '@bpm/diagram-runtime';
import type { AiValidationResult, DiagramFamilyAdapter, DiagramFamilyId, FamilyLayoutOptions } from '@bpm/diagram-runtime';
import type { ValidationIssue, ValidationResult } from '@bpm/validate';

export async function resolveValidation(
  _family: DiagramFamilyId,
  source: string,
  adapter: DiagramFamilyAdapter,
  options?: FamilyLayoutOptions,
): Promise<AiValidationResult> {
  if (adapter.validate) return adapter.validate(source, options) as Promise<AiValidationResult>;
  const parsed = adapter.parse(source);
  const valid = parsed.errors.length === 0 && parsed.semanticErrors.length === 0;
  return { valid, errors: parsed.errors, semanticErrors: parsed.semanticErrors, warnings: [] };
}

function toIssue(issue: {
  line: number;
  column: number;
  message: string;
  code?: string;
  severity?: 'error' | 'warning';
}, fallbackSeverity: ValidationIssue['severity']): ValidationIssue {
  return {
    line: issue.line,
    column: issue.column,
    message: issue.message,
    ...(issue.code ? { code: issue.code } : {}),
    severity: issue.severity ?? fallbackSeverity,
  };
}

function hasInspection(result: AiValidationResult): result is AiValidationResult & {
  inspection: ValidationResult['inspection'];
} {
  return 'inspection' in result;
}

/** Convert the runtime's family-neutral diagnostics into the established BPMN AI result shape. */
export function toValidationResult(result: AiValidationResult): ValidationResult {
  return {
    valid: result.valid,
    errors: result.errors.map((issue) => toIssue(issue, 'error')),
    semanticErrors: result.semanticErrors.map((issue) => toIssue(issue, 'error')),
    warnings: result.warnings.map((issue) => toIssue(issue, 'warning')),
    ...(result.metrics ? { metrics: result.metrics } : {}),
    ...(hasInspection(result) && result.inspection ? { inspection: result.inspection } : {}),
  };
}

export function unsupportedAiResult(family: DiagramFamilyId, operation: keyof typeof NO_AI_CAPABILITIES) {
  return {
    status: 'unsupported' as const,
    family,
    operation,
    message: `Family "${family}" does not support AI ${operation === 'visualReview' ? 'visual review' : operation} yet.`,
  };
}

export function aiCapabilitiesFor(family: DiagramFamilyId) {
  return getFamily(family).aiCapabilities ?? NO_AI_CAPABILITIES;
}
