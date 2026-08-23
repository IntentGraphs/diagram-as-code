import type { LayoutOptions } from '@bpm/layout';
import { validate, type ValidationResult } from '@bpm/validate';

export interface DiagramEvaluationCase {
  id: string;
  text: string;
  maxEdgeCrossings?: number;
  maxNodeOverlaps?: number;
  maxEdgeThroughNode?: number;
  maxRouteFallbacks?: number;
}

export interface DiagramEvaluationResult {
  id: string;
  passed: boolean;
  validation: ValidationResult;
  failures: string[];
}

export interface DiagramEvaluationSummary {
  passed: number;
  failed: number;
  total: number;
  results: DiagramEvaluationResult[];
}

/** Run repeatable geometry gates over a provider's generated or hand-authored fixture set. */
export async function evaluateDiagramSet(
  cases: DiagramEvaluationCase[],
  options?: LayoutOptions,
): Promise<DiagramEvaluationSummary> {
  const results: DiagramEvaluationResult[] = [];
  for (const testCase of cases) {
    const validation = await validate(testCase.text, options);
    const failures: string[] = [];
    if (!validation.valid) failures.push('diagram is not valid');
    const metrics = validation.metrics;
    if (metrics && testCase.maxEdgeCrossings !== undefined && metrics.edgeCrossings > testCase.maxEdgeCrossings) {
      failures.push(`edgeCrossings ${metrics.edgeCrossings} > ${testCase.maxEdgeCrossings}`);
    }
    if (metrics && testCase.maxNodeOverlaps !== undefined && metrics.nodeOverlaps > testCase.maxNodeOverlaps) {
      failures.push(`nodeOverlaps ${metrics.nodeOverlaps} > ${testCase.maxNodeOverlaps}`);
    }
    if (metrics && testCase.maxEdgeThroughNode !== undefined && metrics.edgeThroughNode > testCase.maxEdgeThroughNode) {
      failures.push(`edgeThroughNode ${metrics.edgeThroughNode} > ${testCase.maxEdgeThroughNode}`);
    }
    if (metrics && testCase.maxRouteFallbacks !== undefined && metrics.routeFallbacks > testCase.maxRouteFallbacks) {
      failures.push(`routeFallbacks ${metrics.routeFallbacks} > ${testCase.maxRouteFallbacks}`);
    }
    results.push({ id: testCase.id, passed: failures.length === 0, validation, failures });
  }
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    total: results.length,
    results,
  };
}
