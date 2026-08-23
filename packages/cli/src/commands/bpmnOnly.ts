import { DiagramRuntimeError, resolveDiagramFamily } from '@bpm/diagram-runtime';
import type { CommandResult } from '../commandResult.js';

export interface BpmnSourceGuard {
  /** Set when the source is rejected; the caller should return this as-is. */
  error: CommandResult | null;
  /**
   * The family directive stripped from `source` (identical to `source` when no directive was
   * present). Callers MUST parse/validate this instead of the raw input — passing the raw
   * text through would hand an explicit `diagram: bpmn` directive line straight to the BPMN
   * parser, which does not understand the family-header syntax and fails on it.
   */
  source: string;
}

export function requireBpmnSource(source: string, command: string, json = false): BpmnSourceGuard {
  try {
    const resolved = resolveDiagramFamily(source);
    if (resolved.adapter.id === 'bpmn') {
      return { error: null, source: resolved.header.sourceWithoutDirective };
    }
    return {
      error: {
        exitCode: 1,
        stdout: json ? JSON.stringify({ valid: false, errors: [{ line: 1, column: 1, code: 'unsupported_family', message: `${command} is currently supported for BPMN only (received "${resolved.adapter.id}")` }] }, null, 2) + '\n' : '',
        stderr: `${command} is currently supported for BPMN only\n`,
      },
      source,
    };
  } catch (err) {
    const diagnostics = err instanceof DiagramRuntimeError ? err.diagnostics : [{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }];
    return {
      error: {
        exitCode: 1,
        stdout: json ? JSON.stringify({ valid: false, errors: diagnostics }, null, 2) + '\n' : '',
        stderr: `${command} requires a registered BPMN family\n`,
      },
      source,
    };
  }
}
