import { generateDiagram } from '@bpm/review';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { jsonResult, humanValidation } from '../formatOutput.js';
import { writeFileAtomically } from '../safeWrite.js';

export async function runGenerateCommand(args: ParsedArgs): Promise<CommandResult> {
  const description = args.description ?? '';
  if (!description.trim()) {
    return { exitCode: 1, stdout: '', stderr: 'missing "<description>" for bpm generate\n' };
  }

  const layout = args.engine ? { engineOverride: args.engine } : undefined;
  const provider = args.provider ?? 'manual';

  const result = await generateDiagram(description, {
    family: args.family,
    provider,
    positioning: args.positioning,
    visualReview: args.visualReview,
    maxVisualAttempts: args.maxVisualAttempts,
    layout,
    maxAttempts: args.maxAttempts,
  });

  if (result.status === 'unsupported') {
    return args.json ? jsonResult(1, result) : { exitCode: 1, stdout: '', stderr: result.message + '\n' };
  }

  const json = {
    description,
    providerId: result.providerId,
    positioning: args.positioning ?? 'auto',
    visualReview: args.visualReview,
    generation: {
      status: result.status,
      attempts: result.attempts,
      text: result.text,
    },
    validation: result.validation,
  };

  if (result.status !== 'valid') {
    return args.json
      ? jsonResult(1, json)
      : { exitCode: 1, stdout: humanValidation('generated diagram', result.validation as unknown as Record<string, unknown>), stderr: `generation did not produce a valid diagram within the attempt budget (status: ${result.status})\n` };
  }

  if (args.out) {
    writeFileAtomically(args.out, result.text, 'utf8');
  }

  if (args.json) return jsonResult(0, json);
  if (args.out) return { exitCode: 0, stdout: `✓ generated ${args.out}\n`, stderr: '' };
  return { exitCode: 0, stdout: result.text.endsWith('\n') ? result.text : result.text + '\n', stderr: '' };
}
