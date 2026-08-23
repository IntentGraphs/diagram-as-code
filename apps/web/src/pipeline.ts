import { executeDiagramSource, getFamily, readDiagramHeader } from '@bpm/diagram-runtime';
import type { Diagram } from '@bpm/ast';
import { selectEngine, type PositionedDiagram } from '@bpm/layout';
import type { AiCapabilities, DiagramDiagnostic, DiagramExecutionPhase, DiagramFamilyId, DiagramHeader, FamilyCapabilities } from '@bpm/diagram-runtime';
import type { PaginatedScene } from '@bpm/diagram-core';

export interface PipelineResult {
  family: DiagramFamilyId | null;
  header: DiagramHeader | null;
  capabilities: (FamilyCapabilities & { aiCapabilities?: AiCapabilities }) | null;
  svg: string | null;
  diagram: Diagram | null;
  positioned: PositionedDiagram | null;
  /** Family-neutral positioned execution result used by structured exporters. */
  executionPositioned: unknown | null;
  engineName: string | null;
  ast: unknown | null;
  diagnostics: DiagramDiagnostic[];
  errors: DiagramDiagnostic[];
  warnings: DiagramDiagnostic[];
  paginated: PaginatedScene | null;
}

export async function runPipeline(
  text: string,
  engineOverride?: string,
  onPhase?: (phase: DiagramExecutionPhase) => void,
): Promise<PipelineResult> {
  const header = readDiagramHeader(text);
  try {
    const result = await executeDiagramSource(text, { ...(engineOverride ? { engineOverride } : {}), onPhase });
    return {
      family: result.header.family,
      header: result.header,
      capabilities: { ...result.adapter.capabilities, aiCapabilities: result.adapter.aiCapabilities },
      svg: result.svg,
      diagram: result.header.family === 'bpmn' ? result.result.ast as Diagram : null,
      positioned: result.header.family === 'bpmn' ? result.positioned as PositionedDiagram : null,
      executionPositioned: result.positioned,
      engineName: result.header.family === 'bpmn' && result.result.ast && 'nodes' in (result.result.ast as object)
        ? (engineOverride ?? selectEngine(result.result.ast as import('@bpm/ast').Diagram).name)
        : null,
      ast: result.result.ast,
      diagnostics: result.diagnostics,
      errors: result.diagnostics,
      warnings: result.warnings,
      paginated: result.paginated ?? null,
    };
  } catch (err) {
    const diagnostics = err instanceof Error && 'diagnostics' in err
      ? (err as { diagnostics: DiagramDiagnostic[] }).diagnostics
      : [{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err), severity: 'error' as const }];
    const family = header.diagnostics.length === 0 ? header.family : null;
    let capabilities: (FamilyCapabilities & { aiCapabilities?: AiCapabilities }) | null = null;
    if (family) {
      try {
        capabilities = { ...getFamily(family).capabilities, aiCapabilities: getFamily(family).aiCapabilities };
      } catch {
        // The runtime error already contains the diagnostics for an unregistered family.
      }
    }
    return { family, header: family ? header : null, capabilities, svg: null, diagram: null, positioned: null, executionPositioned: null, engineName: null, ast: null, diagnostics, errors: diagnostics, warnings: [], paginated: null };
  }
}
