import { pageSizeInPixels } from '@bpm/diagram-core';
import {
  getFamily,
  inspectPositionedDiagram,
  type DiagramDiagnostic,
  type DiagramFamilyAdapter,
  type DiagramHeader,
  type FamilyValidationResult,
} from '@bpm/diagram-runtime';
import type { DiagramExecutionResult } from '@bpm/diagram-runtime';

export function resolvedMetadata(header: DiagramHeader, adapter?: DiagramFamilyAdapter): Record<string, unknown> {
  return {
    effectiveFamily: header.family,
    direction: header.direction,
    ...(header.family === 'bpmn' ? { laneDirection: header.laneDirection } : {}),
    capabilities: adapter?.capabilities ?? getFamily(header.family).capabilities,
    ...(header.page
      ? {
          page: header.page,
          pageDimensions: { ...pageSizeInPixels(header.page), unit: 'px', declaredUnit: header.page.unit },
          fitMode: header.page.fit,
        }
      : { pageDimensions: null, fitMode: null }),
    paginationMode: header.paginate,
    pageCount: 1,
    pagination: { mode: header.paginate, pageCount: 1 },
  };
}

export function executionMetadata(result: Pick<DiagramExecutionResult, 'header' | 'paginated'>): Record<string, unknown> {
  const metadata = resolvedMetadata(result.header);
  const pages = result.paginated?.pages ?? [];
  return {
    ...metadata,
    paginationMode: result.paginated?.mode ?? result.header.paginate,
    pageCount: pages.length || 1,
    ...(pages[0] ? { pageDimensions: { width: pages[0].width, height: pages[0].height, unit: 'px' } } : {}),
    pagination: {
      mode: result.paginated?.mode ?? result.header.paginate,
      pageCount: pages.length || 1,
      ...(pages[0] ? { pageDimensions: { width: pages[0].width, height: pages[0].height, unit: 'px' } } : {}),
    },
  };
}

export function validationPayload(
  header: DiagramHeader,
  adapter: DiagramFamilyAdapter,
  result: FamilyValidationResult,
  positioned?: unknown,
  routeFallbacks?: number,
): Record<string, unknown> {
  const inspection = result.inspection ?? (positioned ? inspectPositionedDiagram(header.family, positioned, routeFallbacks) : undefined);
  const errors = result.errors;
  return {
    ...result,
    ...resolvedMetadata(header, adapter),
    ...(inspection ? { inspection, metrics: result.metrics ?? inspection.metrics } : {}),
    status: result.valid ? 'completed' : 'blocked',
    ...(result.valid ? {} : { correctiveAction: 'Fix the listed blocking diagnostics, then validate again.' }),
    errors,
  };
}

export function blockedPayload(
  errors: DiagramDiagnostic[],
  metadata: Record<string, unknown> = {},
  operation: 'export' | 'validation' = 'export',
): Record<string, unknown> {
  const noun = operation === 'export' ? 'Export' : 'Validation';
  return {
    valid: false,
    status: 'blocked',
    ...metadata,
    errors: errors.map((error) => ({
      ...error,
      message: `${error.message} ${noun} blocked. Corrective action: fix this diagnostic and retry.`,
    })),
    warnings: [],
    correctiveAction: operation === 'export' ? 'Fix the blocking diagnostics, then retry the export.' : 'Fix the blocking diagnostics, then validate again.',
  };
}

export function exporterDiagnostic(error: unknown): DiagramDiagnostic {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return {
    line: 1,
    column: 1,
    message,
    ...(code === 'LIMIT' || code === 'INVALID' || code === 'UNSUPPORTED' ? { code } : {}),
    severity: 'error',
  };
}
