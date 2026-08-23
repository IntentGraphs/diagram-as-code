import { execFileSync } from 'node:child_process';
import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { jsonResult } from '../formatOutput.js';
import { runValidateCommand } from './validate.js';
import { sarifResult, type ValidationReport } from '../sarif.js';

function gitFiles(base: string): string[] {
  const range = base === 'HEAD' ? ['HEAD'] : [`${base}...HEAD`];
  const tracked = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', ...range, '--'], { encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).map((file) => file.trim()).filter((file) => file.endsWith('.bpm')))].sort();
}

function failurePayload(file: string, error: unknown): Record<string, unknown> {
  return {
    file,
    valid: false,
    errors: [{ line: 1, column: 1, code: 'cli_input', message: error instanceof Error ? error.message : String(error), severity: 'error' }],
    semanticErrors: [],
    warnings: [],
  };
}

export async function runCheckCommand(args: ParsedArgs): Promise<CommandResult> {
  let files: string[];
  try {
    files = args.changed ? gitFiles(args.base ?? 'HEAD') : [args.file];
  } catch (error) {
    const payload = failurePayload(args.file || 'git', error);
    if (args.outputFormat === 'sarif') return sarifResult(1, [{ file: payload.file as string, payload }]);
    return args.json ? jsonResult(1, { command: 'check', changed: args.changed, files: [payload] }) : { exitCode: 1, stdout: '', stderr: `${String(payload.errors && (payload.errors as Array<{ message: string }>)[0]?.message)}\n` };
  }

  if (files.length === 0) {
    if (args.outputFormat === 'sarif') return sarifResult(0, []);
    if (args.json) return jsonResult(0, { command: 'check', changed: true, base: args.base ?? 'HEAD', valid: true, files: [] });
    return { exitCode: 0, stdout: `✓ no changed .bpm files${args.base ? ` since ${args.base}` : ''}\n`, stderr: '' };
  }

  const reports: ValidationReport[] = [];
  const human: string[] = [];
  let exitCode = 0;
  for (const file of files) {
    try {
      const result = await runValidateCommand({ ...args, file, changed: false, base: undefined, json: args.outputFormat !== 'text' || args.json, outputFormat: 'json' });
      exitCode = Math.max(exitCode, result.exitCode);
      if (args.outputFormat === 'text' && !args.json) human.push(result.stdout);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      reports.push({ file, payload });
    } catch (error) {
      const payload = failurePayload(file, error);
      reports.push({ file, payload });
      human.push(`✗ ${file}: ${String(payload.errors && (payload.errors as Array<{ message: string }>)[0]?.message)}\n`);
      exitCode = 1;
    }
  }

  if (args.outputFormat === 'sarif') return sarifResult(exitCode, reports);
  if (args.json || args.outputFormat === 'json') {
    return jsonResult(exitCode, {
      command: 'check',
      changed: args.changed,
      ...(args.changed ? { base: args.base ?? 'HEAD' } : {}),
      valid: exitCode === 0,
      files: reports.map(({ file, payload }) => ({ file, ...payload })),
    });
  }
  return { exitCode, stdout: human.join(''), stderr: '' };
}

