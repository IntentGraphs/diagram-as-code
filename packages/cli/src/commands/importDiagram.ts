import { importXml } from '@bpm/import-xml';
import { validate } from '@bpm/validate';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { humanConversion, jsonResult } from '../formatOutput.js';
import { writeFileAtomically } from '../safeWrite.js';

export async function runImportDiagramCommand(args: ParsedArgs): Promise<CommandResult> {
  const xml = readFileUtf8(args.file);

  let diagram, text, warnings;
  try {
    ({ diagram, text, warnings } = await importXml(xml));
  } catch (err) {
    const message = `import-diagram failed: ${err instanceof Error ? err.message : String(err)}`;
    return args.json ? jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] }) : { exitCode: 1, stdout: '', stderr: message + '\n' };
  }

  // T2's DOM/bpmn-js-based round-trip gate only runs in the browser (apps/web); this is the
  // portable equivalent for the CLI path — the converted text itself must be valid .bpm.
  const validation = await validate(text);
  const ok = diagram.nodes.length > 0 && validation.valid;

  const json = {
    file: args.file,
    warnings,
    conversion: { status: ok ? 'valid' : 'invalid', text },
    validation,
  };

  if (!ok) {
    return args.json
      ? jsonResult(1, json)
      : { exitCode: 1, stdout: humanConversion('import', args.file, args.out, false), stderr: 'conversion did not produce a valid, non-empty .bpm file\n' };
  }

  if (args.out) writeFileAtomically(args.out, text, 'utf8');

  if (args.json) return jsonResult(0, json);
  if (args.out) return { exitCode: 0, stdout: humanConversion('import', args.file, args.out, true), stderr: '' };
  return { exitCode: 0, stdout: text.endsWith('\n') ? text : text + '\n', stderr: '' };
}
