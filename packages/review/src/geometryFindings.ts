import type { ValidationResult } from '@bpm/validate';
import type { VisualFinding } from './types.js';

/** Map validate warnings/metrics into geometry-sourced visual findings. */
export function geometryFindingsFromValidation(validation: ValidationResult): VisualFinding[] {
  const findings: VisualFinding[] = [];
  for (const issue of validation.inspection?.issueDetails ?? []) {
    const category: VisualFinding['category'] = issue.code === 'node_overlap'
      ? 'label_overlap'
      : issue.code === 'edge_through_node'
        ? 'edge_through_node'
        : issue.code === 'edge_crossing'
          ? 'edge_crossing'
          : 'ambiguous_routing';
    findings.push({
      severity: 'warning',
      category,
      message: issue.message,
      source: 'geometry',
      ...(issue.nodeIds ? { nodeIds: issue.nodeIds } : {}),
      ...(issue.edgeIds ? { edgeIds: issue.edgeIds } : {}),
    });
  }
  for (const w of validation.warnings) {
    if (validation.inspection?.issueDetails.some((issue) => issue.message === w.message)) continue;
    let category: VisualFinding['category'] = 'other';
    if (/through/i.test(w.message)) category = 'edge_through_node';
    else if (/crossing/i.test(w.message)) category = 'edge_crossing';
    else if (/overlap/i.test(w.message)) category = 'label_overlap';
    else if (/orthogonal|via/i.test(w.message)) category = 'ambiguous_routing';
    findings.push({
      severity: w.severity === 'error' ? 'error' : 'warning',
      category,
      message: w.message,
      source: 'geometry',
    });
  }
  return findings;
}
