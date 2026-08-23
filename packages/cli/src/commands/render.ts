import { executeDiagramSource, DiagramRuntimeError } from '@bpm/diagram-runtime';
import { Resvg } from '@resvg/resvg-js';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { executionMetadata } from '../diagnosticPayload.js';
import { jsonResult } from '../formatOutput.js';
import { writeFileAtomically } from '../safeWrite.js';

export async function runRenderCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  let result;
  try {
    result = await executeDiagramSource(text, args.engine ? { engineOverride: args.engine } : undefined);
  } catch (err) {
    const blocking = err instanceof DiagramRuntimeError ? err.diagnostics : [{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }];
    return args.json
      ? jsonResult(1, { valid: false, errors: blocking })
      : { exitCode: 1, stdout: '', stderr: blocking.map((e) => e.message).join('\n') + '\n' };
  }
  const blocking = result.diagnostics;
  const warnings = result.warnings;
  if (blocking.length > 0 || !result.svg) {
    return args.json ? jsonResult(1, { valid: false, errors: blocking }) : { exitCode: 1, stdout: '', stderr: blocking.map((e) => e.message).join('\n') + '\n' };
  }
  if (args.format === 'png' && !args.out) {
    return args.json
      ? jsonResult(1, { valid: false, errors: [{ message: '--format png requires -o <path>', severity: 'error' }] })
      : { exitCode: 1, stdout: '', stderr: '--format png requires -o <path>\n' };
  }
  try {
    const svg = result.svg;
    if (args.format === 'png') {
      const png = new Resvg(svg).render().asPng();
      writeFileAtomically(args.out as string, Buffer.from(png));
      return args.json
        ? { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(result), output: { generated: true, path: args.out, format: 'png' }, warnings, errors: [] }, null, 2) + '\n', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: warnings.map((warning) => `warning: ${warning.message}\n`).join('') };
    }
    if (args.out) {
      writeFileAtomically(args.out, svg, 'utf8');
      return args.json
        ? { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(result), output: { generated: true, path: args.out, format: 'svg' }, warnings, errors: [] }, null, 2) + '\n', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: warnings.map((warning) => `warning: ${warning.message}\n`).join('') };
    }
    if (args.json) return { exitCode: 0, stdout: JSON.stringify({ valid: true, status: 'completed', ...executionMetadata(result), output: { generated: false, format: 'svg', inline: true }, warnings, errors: [] }, null, 2) + '\n', stderr: '' };
    return { exitCode: 0, stdout: svg.endsWith('\n') ? svg : svg + '\n', stderr: warnings.map((warning) => `warning: ${warning.message}\n`).join('') };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) {
      return jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] });
    }
    return { exitCode: 1, stdout: '', stderr: message + '\n' };
  }
}
