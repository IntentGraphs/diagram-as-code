import { validateDiagramSource, DiagramRuntimeError, executeDiagramSource, readDiagramHeader, resolveDiagramFamily } from '@bpm/diagram-runtime';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { blockedPayload, resolvedMetadata, validationPayload } from '../diagnosticPayload.js';
import { humanValidation, jsonResult } from '../formatOutput.js';

export async function runValidateCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  let result;
  try {
    result = await validateDiagramSource(text, args.engine ? { engineOverride: args.engine } : undefined);
  } catch (err) {
    const diagnostics = err instanceof DiagramRuntimeError ? err.diagnostics : [{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }];
    const header = readDiagramHeader(text);
    let metadata: Record<string, unknown> = { effectiveFamily: header.family, direction: header.direction, ...(header.family === 'bpmn' ? { laneDirection: header.laneDirection } : {}) };
    try { metadata = resolvedMetadata(header, resolveDiagramFamily(text).adapter); } catch { /* keep header metadata for malformed/unsupported sources */ }
    const payload = { ...blockedPayload(diagnostics, metadata, 'validation'), semanticErrors: [], warnings: [] };
    return args.json ? jsonResult(1, payload) : { exitCode: 1, stdout: humanValidation(args.file, payload), stderr: '' };
  }
  const resolved = resolveDiagramFamily(text);
  const executed = result.valid
    ? await executeDiagramSource(text, args.engine ? { engineOverride: args.engine } : undefined)
    : undefined;
  const payload = validationPayload(resolved.header, resolved.adapter, result, executed?.positioned ?? undefined, executed?.routeFallbacks);
  return args.json
    ? jsonResult(result.valid ? 0 : 1, payload)
    : { exitCode: result.valid ? 0 : 1, stdout: humanValidation(args.file, payload), stderr: '' };
}
