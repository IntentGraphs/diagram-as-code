import { getFamily, readDiagramHeader, type AiUnsupportedResult } from '@bpm/diagram-runtime';
import { validateDiagramSource } from '@bpm/diagram-runtime';
import { applyTextPatches, reviewDiagram, repairDiagram } from '@bpm/review';
import type { DiagramReviewResult, VisualFinding } from '@bpm/review';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { readFileUtf8 } from '../readInput.js';
import { formatDiagnostics, humanReview, jsonResult } from '../formatOutput.js';
import { writeFileAtomically } from '../safeWrite.js';

function unsupported(args: ParsedArgs, result: AiUnsupportedResult): CommandResult {
  return args.json
    ? jsonResult(1, result)
    : { exitCode: 1, stdout: '', stderr: result.message + '\n' };
}

function reviewPayload(result: DiagramReviewResult): Record<string, unknown> {
  return {
    validation: result.validation,
    visualFindings: result.visualFindings,
    providerId: result.providerId,
  };
}

function reviewFailure(args: ParsedArgs, payload: Record<string, unknown>, message?: string): CommandResult {
  if (args.json) return jsonResult(1, payload);
  return { exitCode: 1, stdout: humanReview(args.file, payload), stderr: message ? message + '\n' : '' };
}

/** Read-only validation and visual review. It never writes the source diagram. */
export async function runReviewCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  const header = readDiagramHeader(text);
  if (header.diagnostics.length > 0) {
    const payload = { validation: { valid: false, errors: header.diagnostics }, visualFindings: [], providerId: args.provider ?? 'manual' };
    return args.json
      ? jsonResult(1, payload)
      : { exitCode: 1, stdout: humanReview(args.file, payload), stderr: '' };
  }
  const family = header.family;
  const capabilities = getFamily(family).aiCapabilities;
  if (!capabilities?.visualReview) {
    const result: AiUnsupportedResult = { status: 'unsupported', family, operation: 'visualReview', message: `Family "${family}" does not support AI visual review yet.` };
    return unsupported(args, result);
  }
  const source = header.sourceWithoutDirective;
  const layout = args.engine ? { engineOverride: args.engine } : undefined;
  const provider = args.provider ?? 'manual';
  const preview = await validateDiagramSource(text, layout);

  if (!preview.valid) {
    const repair = await repairDiagram(source, {
      provider,
      layout,
      maxAttempts: args.maxAttempts,
      family,
    });
    if (repair.status === 'unsupported') return unsupported(args, repair);
    const payload: Record<string, unknown> = {
      validation: repair.validation,
      visualFindings: repair.findings,
      providerId: repair.providerId,
      repair: {
        status: repair.status,
        attempts: repair.attempts,
        repairedText: repair.text,
      },
    };
    if (args.imageOut) {
      if (repair.status !== 'valid') return reviewFailure(args, payload, 'cannot write --image-out: diagram did not produce a PNG (validation failed?)');
      const visual = await reviewDiagram(repair.text, { provider, layout, family });
      if ('status' in visual) return unsupported(args, visual);
      if (!visual.png) return reviewFailure(args, payload, 'cannot write --image-out: diagram did not produce a PNG (validation failed?)');
      writeFileAtomically(args.imageOut, Buffer.from(visual.png));
    }
    return repair.status === 'valid'
      ? (args.json ? jsonResult(0, payload) : { exitCode: 0, stdout: humanReview(args.file, payload), stderr: '' })
      : reviewFailure(args, payload);
  }

  const result = await reviewDiagram(source, { provider, layout, family });
  if ('status' in result && result.status === 'unsupported') return unsupported(args, result);
  const reviewed = result as DiagramReviewResult;

  if (args.imageOut) {
    if (!reviewed.png) return reviewFailure(args, reviewPayload(reviewed), 'cannot write --image-out: diagram did not produce a PNG (validation failed?)');
    writeFileAtomically(args.imageOut, Buffer.from(reviewed.png));
  }

  const payload = reviewPayload(reviewed);
  const hasErrorFinding = reviewed.visualFindings.some((f) => f.severity === 'error');
  const exitCode = reviewed.validation.valid && !hasErrorFinding ? 0 : 1;
  return args.json
    ? jsonResult(exitCode, payload)
    : { exitCode, stdout: humanReview(args.file, payload), stderr: '' };
}

/** Explicit write-oriented repair. The input is never overwritten; -o is mandatory. */
export async function runFixCommand(args: ParsedArgs): Promise<CommandResult> {
  if (!args.out) {
    const message = 'bpm fix requires -o/--output <path>; source files are never overwritten';
    return args.json ? jsonResult(1, { valid: false, errors: [{ message, severity: 'error' }] }) : { exitCode: 1, stdout: '', stderr: message + '\n' };
  }

  const text = readFileUtf8(args.file);
  const header = readDiagramHeader(text);
  if (header.diagnostics.length > 0) {
    const payload = { validation: { valid: false, errors: header.diagnostics }, fix: { status: 'blocked' }, output: { generated: false, path: args.out } };
    return args.json ? jsonResult(1, payload) : { exitCode: 1, stdout: humanReview(args.file, payload), stderr: '' };
  }
  const family = header.family;
  const capabilities = getFamily(family).aiCapabilities;
  if (!capabilities?.repair) {
    const result: AiUnsupportedResult = { status: 'unsupported', family, operation: 'repair', message: `Family "${family}" does not support AI repair yet.` };
    return unsupported(args, result);
  }

  const source = header.sourceWithoutDirective;
  const layout = args.engine ? { engineOverride: args.engine } : undefined;
  const provider = args.provider ?? 'manual';
  const preview = await validateDiagramSource(text, layout);
  let repairedText = source;
  let validation: { valid: boolean; errors?: unknown } = preview;
  let findings: VisualFinding[] = [];
  let attempts = 0;
  let status: 'valid' | 'unchanged' | 'budget_exhausted' = 'unchanged';

  if (!preview.valid) {
    const repair = await repairDiagram(source, { provider, layout, maxAttempts: args.maxAttempts, family });
    if (repair.status === 'unsupported') return unsupported(args, repair);
    repairedText = repair.text;
    validation = repair.validation;
    findings = repair.findings;
    attempts = repair.attempts;
    status = repair.status === 'valid' ? 'valid' : 'budget_exhausted';
  } else {
    const reviewed = await reviewDiagram(source, { provider, layout, family });
    if ('status' in reviewed) return unsupported(args, reviewed);
    findings = reviewed.visualFindings;
    const patched = applyTextPatches(source, findings);
    repairedText = patched.text;
    if (patched.applied > 0) {
      validation = await validateDiagramSource(repairedText, layout);
      status = validation.valid ? 'valid' : 'budget_exhausted';
      attempts = 1;
    }
  }

  const payload: Record<string, unknown> = {
    file: args.file,
    providerId: provider,
    fix: { status, attempts, findings, text: repairedText },
    validation,
    output: { generated: false, path: args.out },
  };
  if (status !== 'budget_exhausted' && validation.valid) {
    writeFileAtomically(args.out, repairedText, 'utf8');
    (payload.output as Record<string, unknown>).generated = true;
  } else {
    const message = `fix did not produce a valid diagram; ${formatDiagnostics(validation.errors) || 'no corrective patch was applied'}`;
    return args.json ? jsonResult(1, payload) : { exitCode: 1, stdout: humanReview(args.file, payload), stderr: message + '\n' };
  }
  return args.json
    ? jsonResult(0, payload)
    : { exitCode: 0, stdout: humanReview(args.file, payload), stderr: '' };
}
