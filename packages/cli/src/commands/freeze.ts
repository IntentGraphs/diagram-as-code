import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { freezeDiagram, printDiagram } from '@bpm/print-dsl';
import { validate } from '@bpm/validate';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { requireBpmnSource } from './bpmnOnly.js';
import { humanConversion, jsonResult } from '../formatOutput.js';
import { writeFileAtomically } from '../safeWrite.js';

/** Freeze auto-layout coordinates and resolved edge interiors into manual-mode DSL text. */
export async function runFreezeCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  const guard = requireBpmnSource(text, 'freeze', args.json);
  if (guard.error) return guard.error;
  const parsed = parse(guard.source);
  const blocking = parsed.errors.length > 0 ? parsed.errors : parsed.semanticErrors;
  if (blocking.length > 0) {
    return args.json
      ? jsonResult(1, { valid: false, errors: blocking })
      : { exitCode: 1, stdout: '', stderr: 'cannot freeze an invalid diagram\n' };
  }

  try {
    const positioned = await layout(parsed.diagram, args.engine ? { engineOverride: args.engine } : undefined);
    const frozen = freezeDiagram(parsed.diagram, positioned);
    const frozenText = printDiagram(frozen);
    const validation = await validate(frozenText);
    const result = {
      file: args.file,
      conversion: { status: validation.valid ? 'valid' : 'invalid', text: frozenText },
      validation,
    };

    if (!validation.valid) {
      return args.json
        ? jsonResult(1, result)
        : { exitCode: 1, stdout: humanConversion('freeze', args.file, args.out, false), stderr: 'freezing produced manual text that does not validate\n' };
    }
    if (args.out) writeFileAtomically(args.out, frozenText, 'utf8');
    if (args.json) return jsonResult(0, result);
    if (args.out) return { exitCode: 0, stdout: humanConversion('freeze', args.file, args.out, true), stderr: '' };
    return { exitCode: 0, stdout: frozenText.endsWith('\n') ? frozenText : frozenText + '\n', stderr: '' };
  } catch (err) {
    const message = `freeze failed: ${err instanceof Error ? err.message : String(err)}`;
    return args.json ? jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] }) : { exitCode: 1, stdout: '', stderr: message + '\n' };
  }
}
