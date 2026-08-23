import { readDiagramHeader } from './header.js';
import { bpmnAdapter } from './bpmn.js';
import { architectureAdapter } from '@bpm/diagram-architecture';
import { mindmapAdapter } from '@bpm/diagram-mindmap';
import { flowchartAdapter } from '@bpm/diagram-flowchart';
import { ganttAdapter } from '@bpm/diagram-gantt';
import { fitSvgToPage, getRouteFallbackCount, MIN_PAGE_SCALE, resetRouteFallbackCount } from '@bpm/diagram-core';
import type { DiagramDiagnostic, DiagramExecutionPhase, DiagramExecutionResult, DiagramFamilyAdapter, DiagramFamilyId, FamilyValidationResult, ParsedDiagramSource, ResolvedDiagramFamily, FamilyLayoutOptions } from './types.js';
import { inspectPositionedDiagram } from './inspection.js';
import { paginateBpmn } from './bpmnPagination.js';

// This file is the intentional single composition root; new diagram families register here.
const defaultAdapters = new Map<DiagramFamilyId, DiagramFamilyAdapter>([
  [bpmnAdapter.id, bpmnAdapter],
  [mindmapAdapter.id, mindmapAdapter],
  [flowchartAdapter.id, flowchartAdapter],
  [architectureAdapter.id, architectureAdapter],
  [ganttAdapter.id, ganttAdapter],
]);
const adapters = new Map<DiagramFamilyId, DiagramFamilyAdapter>(defaultAdapters);

export class DiagramRuntimeError extends Error {
  readonly diagnostics: DiagramDiagnostic[];

  constructor(message: string, diagnostics: DiagramDiagnostic[]) {
    super(message);
    this.name = 'DiagramRuntimeError';
    this.diagnostics = diagnostics;
  }
}

export function registerFamily(adapter: DiagramFamilyAdapter): void {
  adapters.set(adapter.id, adapter);
}

/** Clears the registry for isolated tests. */
export function clearFamilies(): void {
  adapters.clear();
}

export function resetFamilies(): void {
  adapters.clear();
  for (const [id, adapter] of defaultAdapters) adapters.set(id, adapter);
}

export function getFamily(id: DiagramFamilyId): DiagramFamilyAdapter {
  const adapter = adapters.get(id);
  if (!adapter) {
    throw new DiagramRuntimeError(
      `No diagram family adapter registered for "${id}". Registered: ${[...adapters.keys()].join(', ') || '(none)'}`,
      [{ line: 1, column: 1, message: `No diagram family adapter registered for "${id}"`, code: 'missing_adapter', token: id }],
    );
  }
  return adapter;
}

export function listFamilies(): DiagramFamilyId[] {
  return [...adapters.keys()];
}

/**
 * Only forwards `engineOverride` to adapters whose capabilities declare support for it —
 * an adapter that doesn't must never see the option, silently or otherwise.
 */
function scopedLayoutOptions(
  adapter: DiagramFamilyAdapter,
  options?: FamilyLayoutOptions,
): FamilyLayoutOptions | undefined {
  const scoped = Object.fromEntries(Object.entries(options ?? {}).filter(([, value]) => value !== undefined)) as FamilyLayoutOptions;
  if (!adapter.capabilities.engineOverride) delete scoped.engineOverride;
  return Object.keys(scoped).length > 0 ? scoped : undefined;
}

export function resolveDiagramFamily<Ast = unknown, Positioned = unknown>(source: string): ResolvedDiagramFamily<Ast, Positioned> {
  const header = readDiagramHeader(source);
  if (header.diagnostics.length > 0) {
    throw new DiagramRuntimeError(
      header.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
      header.diagnostics,
    );
  }
  return {
    header,
    adapter: getFamily(header.family) as DiagramFamilyAdapter<Ast, Positioned>,
  };
}

export function parseDiagramSource<Ast = unknown, Positioned = unknown>(source: string): ParsedDiagramSource<Ast, Positioned> {
  const resolved = resolveDiagramFamily<Ast, Positioned>(source);
  const parsedResult = resolved.adapter.parse(resolved.header.sourceWithoutDirective);
  const metadata = {
    ...(resolved.header.page ? { page: resolved.header.page } : {}),
    paginate: resolved.header.paginate,
    ...(resolved.header.timescale ? { timescale: resolved.header.timescale } : {}),
    ...(resolved.header.renderMode ? { renderMode: resolved.header.renderMode } : {}),
    ...(resolved.header.directionSpecified && resolved.header.direction ? { direction: resolved.header.direction } : {}),
    ...(resolved.header.laneDirectionSpecified && resolved.header.laneDirection ? { laneDirection: resolved.header.laneDirection } : {}),
    ...(resolved.header.pageBreak ? { pageBreak: resolved.header.pageBreak } : {}),
  };
  const parsedTimescale = parsedResult.ast && typeof parsedResult.ast === 'object' && 'timescale' in parsedResult.ast
    ? (parsedResult.ast as { timescale?: unknown }).timescale
    : undefined;
  if (resolved.header.timescale && typeof parsedTimescale === 'string' && parsedTimescale !== resolved.header.timescale) {
    parsedResult.semanticErrors.push({
      line: 1,
      column: 1,
      message: `Conflicting Gantt timescales: calendar selects ${parsedTimescale}, while timescale selects ${resolved.header.timescale}`,
      code: 'conflicting_timescale',
    });
  }
  const ast = Object.keys(metadata).length > 0 && parsedResult.ast && typeof parsedResult.ast === 'object'
    ? { ...(parsedResult.ast as object), ...metadata } as Ast
    : parsedResult.ast;
  return {
    ...resolved,
    result: { ...parsedResult, ast },
  };
}

export async function executeDiagramSource<Ast = unknown, Positioned = unknown>(
  source: string,
  options?: { engineOverride?: string; routing?: FamilyLayoutOptions['routing']; onPhase?: (phase: DiagramExecutionPhase) => void },
): Promise<DiagramExecutionResult<Ast, Positioned>> {
  const { onPhase, ...layoutOptions } = options ?? {};
  onPhase?.('parsing');
  const parsed = parseDiagramSource<Ast, Positioned>(source);
  const diagnostics = [...parsed.result.errors, ...parsed.result.semanticErrors];
  const parseWarnings = parsed.result.warnings ?? [];
  if (diagnostics.length > 0) {
    return { ...parsed, positioned: null, svg: null, diagnostics, warnings: parseWarnings };
  }
  if (parsed.header.paginate === 'tile' || parsed.header.paginate === 'hybrid' || (parsed.header.paginate === 'semantic' && parsed.header.family !== 'bpmn')) {
    const diagnostic: DiagramDiagnostic = {
      line: 1,
      column: 1,
      message: `Pagination mode "${parsed.header.paginate}" is not supported for family "${parsed.header.family}"`,
      code: 'pagination_unsupported_combination',
      severity: 'error',
    };
    return { ...parsed, positioned: null, svg: null, diagnostics: [diagnostic], warnings: parseWarnings };
  }
  try {
    resetRouteFallbackCount();
    onPhase?.('layout');
    const astOptions = parsed.result.ast && typeof parsed.result.ast === 'object' ? parsed.result.ast as { direction?: string; laneDirection?: string; routing?: FamilyLayoutOptions['routing'] } : {};
    const positioned = await parsed.adapter.layout(parsed.result.ast, scopedLayoutOptions(parsed.adapter, {
      ...layoutOptions,
      direction: astOptions.direction as FamilyLayoutOptions['direction'],
      laneDirection: astOptions.laneDirection as FamilyLayoutOptions['laneDirection'],
      // An explicit runtime override must win over the DSL directive. When no
      // override is supplied, preserve the AST's routing choice.
      routing: layoutOptions.routing ?? astOptions.routing,
    }));
    const routeFallbacks = getRouteFallbackCount();
    onPhase?.('rendering');
    const rawSvg = parsed.adapter.render(positioned);
    const fitted = parsed.header.page ? fitSvgToPage(rawSvg, parsed.header.page) : undefined;
    const semanticBpmn = parsed.header.family === 'bpmn' && parsed.header.paginate === 'semantic';
    if (fitted && parsed.header.page?.fit === 'strict' && fitted.scale < MIN_PAGE_SCALE && !semanticBpmn) {
      const diagnostic: DiagramDiagnostic = {
        line: 1,
        column: 1,
        message: `Diagram is too dense for the declared page at a readable scale (scale ${fitted.scale.toFixed(3)} is below ${MIN_PAGE_SCALE})`,
        code: 'page_too_dense',
        severity: 'error',
      };
      return { ...parsed, positioned: null, svg: null, diagnostics: [diagnostic], warnings: parseWarnings, routeFallbacks };
    }
    if (semanticBpmn) {
      const pagination = paginateBpmn(positioned as never, parsed.header.page, parsed.header.pageBreak);
      const toDiagnostic = (diagnostic: typeof pagination.diagnostics[number]): DiagramDiagnostic => ({ line: 1, column: 1, message: diagnostic.message, code: diagnostic.code, severity: diagnostic.severity });
      const paginationErrors = pagination.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map(toDiagnostic);
      const paginationWarnings = pagination.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').map(toDiagnostic);
      return { ...parsed, positioned, svg: fitted?.svg ?? rawSvg, diagnostics: paginationErrors, warnings: [...parseWarnings, ...paginationWarnings], paginated: pagination.scene, routeFallbacks };
    }
    return { ...parsed, positioned, svg: fitted?.svg ?? rawSvg, diagnostics: [], warnings: parseWarnings, routeFallbacks };
  } catch (err) {
    const diagnostic: DiagramDiagnostic = {
      line: 1,
      column: 1,
      message: err instanceof Error ? err.message : String(err),
      severity: 'error',
    };
    return { ...parsed, positioned: null, svg: null, diagnostics: [diagnostic], warnings: parseWarnings };
  }
}

export async function validateDiagramSource<Ast = unknown, Positioned = unknown>(
  source: string,
  options?: { engineOverride?: string; routing?: FamilyLayoutOptions['routing'] },
): Promise<FamilyValidationResult> {
  const resolved = resolveDiagramFamily<Ast, Positioned>(source);
  if (resolved.header.paginate === 'tile' || resolved.header.paginate === 'hybrid' || (resolved.header.paginate === 'semantic' && resolved.header.family !== 'bpmn')) {
    const diagnostic: DiagramDiagnostic = { line: 1, column: 1, message: `Pagination mode "${resolved.header.paginate}" is not supported for family "${resolved.header.family}"`, code: 'pagination_unsupported_combination', severity: 'error' };
    return { valid: false, errors: [diagnostic], semanticErrors: [], warnings: [] };
  }
  if (resolved.adapter.validate) {
    const validated = await resolved.adapter.validate(resolved.header.sourceWithoutDirective, scopedLayoutOptions(resolved.adapter, {
      ...options,
      ...(resolved.header.directionSpecified ? { direction: resolved.header.direction } : {}),
      ...(resolved.header.laneDirectionSpecified ? { laneDirection: resolved.header.laneDirection } : {}),
    }));
    // Parse, semantic, resource, and layout errors are already complete blocking
    // diagnostics. Do not execute the source a second time, which would reclassify
    // semantic diagnostics into `errors` and duplicate them in the CLI contract.
    if (!validated.valid) return validated;
    const fitted = await executeDiagramSource<Ast, Positioned>(source, options);
    const inspection = fitted.positioned
      ? inspectPositionedDiagram(resolved.header.family, fitted.positioned, fitted.routeFallbacks)
      : undefined;
    const geometryWarnings = inspection?.issueDetails.map((issue) => ({ line: 1, column: 1, message: issue.message, severity: 'warning' as const, code: issue.code })) ?? [];
    const fallbackWarnings = inspection && inspection.metrics.routeFallbacks > 0
      ? [{ line: 1, column: 1, message: `${inspection.metrics.routeFallbacks} route fallback(s) used an L-corner after clearance search failed`, severity: 'warning' as const, code: 'route_fallback' }]
      : [];
    const combinedWarnings = [...validated.warnings, ...fitted.warnings, ...geometryWarnings, ...fallbackWarnings];
    const warnings = combinedWarnings.filter((warning, index, all) => all.findIndex((candidate) => candidate.code === warning.code && candidate.message === warning.message) === index);
    return {
      ...validated,
      valid: validated.valid && fitted.diagnostics.length === 0,
      errors: [...validated.errors, ...fitted.diagnostics],
      warnings,
      ...(inspection ? { metrics: inspection.metrics, inspection } : {}),
    };
  }
  const executed = await executeDiagramSource<Ast, Positioned>(source, options);
  const inspection = executed.positioned
    ? inspectPositionedDiagram(resolved.header.family, executed.positioned, executed.routeFallbacks)
    : undefined;
  const geometryWarnings = inspection?.issueDetails.map((issue) => ({ line: 1, column: 1, message: issue.message, severity: 'warning' as const, code: issue.code })) ?? [];
  return {
    valid: executed.diagnostics.length === 0,
    errors: executed.diagnostics,
    semanticErrors: [],
    warnings: [
      ...geometryWarnings,
      ...(inspection && inspection.metrics.routeFallbacks > 0 ? [{ line: 1, column: 1, message: `${inspection.metrics.routeFallbacks} route fallback(s) used an L-corner after clearance search failed`, severity: 'warning' as const, code: 'route_fallback' }] : []),
    ],
    ...(inspection ? { metrics: inspection.metrics, inspection } : {}),
  };
}

export async function exportStructuredDiagram<Ast = unknown, Positioned = unknown>(
  source: string,
  format: string,
  options?: { engineOverride?: string },
): Promise<string> {
  const resolved = resolveDiagramFamily<Ast, Positioned>(source);
  if (!resolved.adapter.capabilities.structuredExport.includes(format) || !resolved.adapter.exportStructured) {
    throw new DiagramRuntimeError(
      `Family "${resolved.adapter.id}" does not support structured export "${format}"`,
      [{ line: 1, column: 1, message: `Family "${resolved.adapter.id}" does not support structured export "${format}"`, code: 'unsupported_export', token: format }],
    );
  }
  const executed = await executeDiagramSource<Ast, Positioned>(source, options);
  if (executed.diagnostics.length > 0 || !executed.positioned) {
    throw new DiagramRuntimeError('Diagram cannot be exported because it is invalid', executed.diagnostics);
  }
  return resolved.adapter.exportStructured(executed.result.ast, executed.positioned, format);
}

/**
 * Exports already-parsed-and-laid-out `ast`/`positioned` values for a known family, without
 * re-running the source pipeline. Callers that already hold a trusted execution result (e.g. a
 * UI that just rendered the current editor text) should use this instead of
 * `exportStructuredDiagram(source, ...)` — re-parsing live source text a second time risks
 * exporting content that has since diverged from what was actually validated and previewed.
 * Still capability-gated: non-BPMN families cannot reach `exportStructured` for a
 * BPMN-XML-only format this way either.
 */
export function exportPositionedDiagram<Ast = unknown, Positioned = unknown>(
  family: DiagramFamilyId,
  ast: Ast,
  positioned: Positioned,
  format: string,
): string {
  const adapter = getFamily(family) as DiagramFamilyAdapter<Ast, Positioned>;
  if (!adapter.capabilities.structuredExport.includes(format) || !adapter.exportStructured) {
    throw new DiagramRuntimeError(
      `Family "${family}" does not support structured export "${format}"`,
      [{ line: 1, column: 1, message: `Family "${family}" does not support structured export "${format}"`, code: 'unsupported_export', token: format }],
    );
  }
  return adapter.exportStructured(ast, positioned, format);
}
