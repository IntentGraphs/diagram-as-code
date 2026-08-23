import { executeDiagramSource, DiagramRuntimeError, resolveDiagramFamily } from '@bpm/diagram-runtime';
import { exportPptx, snapshotFromRuntime, type PptxExportWarning } from '@bpm/export-pptx';
import { exportDocx } from '@bpm/export-docx';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { blockedPayload, executionMetadata, exporterDiagnostic, resolvedMetadata } from '../diagnosticPayload.js';
import { writeFileAtomically } from '../safeWrite.js';
import { jsonResult } from '../formatOutput.js';

function formatPptxWarnings(warnings: PptxExportWarning[]): string {
  const preview = warnings.slice(0, 5).map((warning) => `warning: ${warning.message}`);
  const remaining = warnings.length - preview.length;
  if (remaining > 0) preview.push(`warning: ${remaining} additional editable-text warning${remaining === 1 ? '' : 's'} omitted; review the exported slide for readability`);
  return preview.length ? `${preview.join('\n')}\n` : '';
}

export async function runExportCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  if (args.target === 'pptx' || args.target === 'docx') {
    if (!args.out) {
      const message = `${args.target.toUpperCase()} export requires -o <path> because it is binary`;
      return args.json ? jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] }) : { exitCode: 1, stdout: '', stderr: message + '\n' };
    }
    try {
      const resolved = resolveDiagramFamily(text);
      const metadata = resolvedMetadata(resolved.header, resolved.adapter);
      if (args.target === 'pptx' && resolved.adapter.capabilities.pptx !== true) {
        const message = `PPTX export is not supported for family "${resolved.adapter.id}"`;
        const diagnostic = { line: 1, column: 1, message, code: 'unsupported_export', severity: 'error' as const };
        return args.json
          ? jsonResult(1, blockedPayload([diagnostic], metadata))
          : { exitCode: 1, stdout: '', stderr: message + '\n' };
      }
      if (args.target === 'docx' && resolved.header.family !== 'bpmn') {
        const message = `DOCX export is not supported for family "${resolved.adapter.id}"`;
        const diagnostic = { line: 1, column: 1, message, code: 'unsupported_export', severity: 'error' as const };
        return args.json
          ? jsonResult(1, blockedPayload([diagnostic], metadata))
          : { exitCode: 1, stdout: '', stderr: message + '\n' };
      }
      const executed = await executeDiagramSource(text, args.engine ? { engineOverride: args.engine } : undefined);
      if (executed.diagnostics.length > 0 || !executed.positioned) throw new DiagramRuntimeError('Diagram cannot be exported because it is invalid', executed.diagnostics);
      if (args.target === 'docx' && !executed.paginated) throw new DiagramRuntimeError('DOCX export requires BPMN semantic pagination (add "paginate: semantic")', [{ line: 1, column: 1, message: 'DOCX export requires BPMN semantic pagination (add "paginate: semantic")', code: 'unsupported_export', severity: 'error' }]);
      const warnings: PptxExportWarning[] = [];
      const bytes = args.target === 'docx'
        ? await exportDocx(executed.paginated!, { family: 'bpmn', title: 'BPMN diagram' })
        : await exportPptx(snapshotFromRuntime({ family: executed.header.family, positioned: executed.positioned, page: executed.header.page, paginated: executed.paginated }), { warnings });
      writeFileAtomically(args.out, Buffer.from(bytes));
      const allWarnings = [...executed.warnings, ...warnings.filter((warning) => {
        const duplicateCode = warning.code === 'pagination_continuation' ? 'pagination_cross_page_edge' : warning.code === 'page_scale' ? 'pagination_readability' : warning.code;
        return !executed.warnings.some((diagnostic) => diagnostic.code === duplicateCode && diagnostic.message === warning.message);
      })];
      return args.json
        ? { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(executed), output: { generated: true, path: args.out, format: args.target }, warnings: allWarnings, errors: [] }, null, 2) + '\n', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: formatPptxWarnings(allWarnings as PptxExportWarning[]) };
    } catch (err) {
      const blocking = err instanceof DiagramRuntimeError ? err.diagnostics : [exporterDiagnostic(err)];
      let metadata: Record<string, unknown> = {};
      try { const resolved = resolveDiagramFamily(text); metadata = resolvedMetadata(resolved.header, resolved.adapter); } catch { /* diagnostics already describe the malformed source */ }
      return args.json ? jsonResult(1, blockedPayload(blocking, metadata)) : { exitCode: 1, stdout: '', stderr: blocking.map((e) => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join('\n') + ' Export blocked. Corrective action: fix this diagnostic and retry.\n' };
    }
  }
  let output: string;
  let executedForOutput;
  try {
    const resolved = resolveDiagramFamily(text);
    executedForOutput = await executeDiagramSource(text, args.engine ? { engineOverride: args.engine } : undefined);
    if (executedForOutput.diagnostics.length > 0 || !executedForOutput.positioned) throw new DiagramRuntimeError('Diagram cannot be exported because it is invalid', executedForOutput.diagnostics);
    if (!resolved.adapter.capabilities.structuredExport.includes(args.target ?? 'bpmn-xml') || !resolved.adapter.exportStructured) throw new DiagramRuntimeError(`Family "${resolved.adapter.id}" does not support structured export "${args.target ?? 'bpmn-xml'}"`, [{ line: 1, column: 1, message: `Family "${resolved.adapter.id}" does not support structured export "${args.target ?? 'bpmn-xml'}"`, code: 'unsupported_export', severity: 'error' }]);
    output = resolved.adapter.exportStructured(executedForOutput.result.ast, executedForOutput.positioned, args.target ?? 'bpmn-xml');
  } catch (err) {
    const blocking = err instanceof DiagramRuntimeError ? err.diagnostics : [exporterDiagnostic(err)];
    return args.json
      ? jsonResult(1, { valid: false, errors: blocking })
      : { exitCode: 1, stdout: '', stderr: blocking.map((e) => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join('\n') + ' Export blocked. Corrective action: fix this diagnostic and retry.\n' };
  }
  try {
    if (args.out) {
      writeFileAtomically(args.out, output, 'utf8');
      return args.json
        ? { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(executedForOutput), output: { generated: true, path: args.out, format: args.target ?? 'bpmn-xml' }, warnings: executedForOutput.warnings, errors: [] }, null, 2) + '\n', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: executedForOutput.warnings.map((warning) => `warning: ${warning.message}\n`).join('') };
    }
    if (args.json) return { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(executedForOutput), output: { generated: false, format: args.target ?? 'bpmn-xml', inline: true }, warnings: executedForOutput.warnings, errors: [] }, null, 2) + '\n', stderr: '' };
    return { exitCode: 0, stdout: output.endsWith('\n') ? output : output + '\n', stderr: executedForOutput.warnings.map((warning) => `warning: ${warning.message}\n`).join('') };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) {
      return jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] });
    }
    return { exitCode: 1, stdout: '', stderr: message + '\n' };
  }
}
