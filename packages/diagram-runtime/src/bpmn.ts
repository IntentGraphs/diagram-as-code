import type { Diagram } from '@bpm/ast';
import { layout, type LayoutOptions, type PositionedDiagram } from '@bpm/layout';
import { parse } from '@bpm/parser';
import { render } from '@bpm/render';
import { checkDiagramResourceLimits, layoutComplexityWarning, MAX_SOURCE_CHARS, validate } from '@bpm/validate';
import { exportToXml } from '@bpm/export-xml';
import type { DiagramFamilyAdapter } from './types.js';

export const BPMN_EXPORT_FORMAT = 'bpmn-xml';

function emptyDiagram(): Diagram {
  return { pools: [], nodes: [], edges: [] };
}

function limitDiagnostics(text: string, diagram: Diagram) {
  return checkDiagramResourceLimits(text, diagram).map((issue) => ({
    line: issue.line ?? 1,
    column: issue.column ?? 1,
    message: issue.message,
    ...(issue.code ? { code: issue.code } : {}),
    severity: issue.severity,
  }));
}

function warningDiagnostics(diagram: Diagram) {
  const issue = layoutComplexityWarning(diagram);
  return issue ? [{
    line: issue.line ?? 1,
    column: issue.column ?? 1,
    message: issue.message,
    ...(issue.code ? { code: issue.code } : {}),
    severity: issue.severity,
  }] : [];
}

export const bpmnAdapter: DiagramFamilyAdapter<Diagram, PositionedDiagram> = {
  id: 'bpmn',
  parse(source) {
    // Reject oversized BPMN source before the parser allocates a large AST. Other family parsers
    // apply their own equivalent source guard; keeping this at the adapter boundary ensures the
    // live web path cannot bypass the shared resource contract.
    if (source.length > MAX_SOURCE_CHARS) {
      return {
        ast: emptyDiagram(),
        errors: limitDiagnostics(source, emptyDiagram()),
        semanticErrors: [],
      };
    }
    const result = parse(source);
    const limits = result.errors.length === 0 && result.semanticErrors.length === 0
      ? limitDiagnostics(source, result.diagram)
      : [];
    return {
      ast: result.diagram,
      errors: [...result.errors, ...limits],
      semanticErrors: result.semanticErrors,
      warnings: result.errors.length === 0 && result.semanticErrors.length === 0 && limits.length === 0
        ? warningDiagnostics(result.diagram)
        : [],
    };
  },
  layout(ast, options) {
    return layout(ast, options as LayoutOptions | undefined);
  },
  render(positioned) {
    return render(positioned);
  },
  validate(source, options) {
    // Keep the established BPMN validation JSON contract intact. The runtime
    // exposes the same shape while family adapters remain free to add fields.
    return validate(source, options as LayoutOptions | undefined) as Promise<any>;
  },
  exportStructured(ast, positioned, format) {
    if (format !== BPMN_EXPORT_FORMAT) {
      throw new Error(`Unsupported structured export "${format}" for BPMN`);
    }
    return exportToXml(ast, positioned);
  },
  capabilities: {
    svg: true,
    png: true,
    pptx: true,
    structuredExport: [BPMN_EXPORT_FORMAT],
    editorMode: 'bpmn-js',
    engineOverride: true,
  },
  aiCapabilities: {
    generation: true,
    repair: true,
    visualReview: true,
    geometryInspection: true,
    semanticValidation: true,
  },
};
