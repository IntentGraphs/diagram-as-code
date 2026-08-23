import type { CommandResult } from './commandResult.js';

type JsonObject = Record<string, unknown>;

function diagnostics(value: unknown): Array<{ message?: string; code?: string; severity?: string }> {
  return Array.isArray(value) ? value as Array<{ message?: string; code?: string; severity?: string }> : [];
}

export function jsonResult(exitCode: number, payload: unknown): CommandResult {
  return { exitCode, stdout: JSON.stringify(payload, null, 2) + '\n', stderr: '' };
}

export function formatDiagnostics(value: unknown): string {
  return diagnostics(value).map((diagnostic) => {
    const prefix = diagnostic.code ? `[${diagnostic.code}] ` : '';
    return `- ${prefix}${diagnostic.message ?? 'unspecified diagnostic'}`;
  }).join('\n');
}

export function humanValidation(file: string, payload: JsonObject): string {
  const valid = payload.valid === true;
  const family = typeof payload.effectiveFamily === 'string' ? ` ${payload.effectiveFamily}` : '';
  const metrics = payload.metrics && typeof payload.metrics === 'object' ? payload.metrics as JsonObject : undefined;
  const counts = metrics
    ? Object.entries(metrics).filter(([, value]) => typeof value === 'number').slice(0, 3).map(([key, value]) => `${key}=${value}`).join(', ')
    : '';
  if (valid) return `✓ ${file}: valid${family}${counts ? ` (${counts})` : ''}\n`;
  const body = formatDiagnostics(payload.errors);
  return `✗ ${file}: invalid${family}\n${body ? `${body}\n` : ''}`;
}

export function humanReview(file: string, payload: JsonObject): string {
  const validation = payload.validation && typeof payload.validation === 'object' ? payload.validation as JsonObject : {};
  const findings = Array.isArray(payload.visualFindings) ? payload.visualFindings as Array<JsonObject> : [];
  const errors = diagnostics(validation.errors);
  const blocking = findings.filter((finding) => finding.severity === 'error');
  const status = validation.valid === true && blocking.length === 0 ? 'clean' : 'needs attention';
  const lines = [`${status === 'clean' ? '✓' : '✗'} ${file}: review ${status}`];
  for (const diagnostic of errors) lines.push(`- ${diagnostic.message ?? 'validation error'}`);
  for (const finding of findings) lines.push(`- ${String(finding.category ?? 'finding')}: ${String(finding.message ?? 'unspecified finding')}`);
  if (payload.repair && typeof payload.repair === 'object') {
    const repair = payload.repair as JsonObject;
    lines.push(`repair: ${String(repair.status ?? 'not attempted')} after ${String(repair.attempts ?? 0)} attempt(s)`);
  }
  return lines.join('\n') + '\n';
}

export function humanConversion(operation: string, file: string, out: string | undefined, valid: boolean): string {
  const state = valid ? 'completed' : 'blocked';
  return `${valid ? '✓' : '✗'} ${operation} ${file}: ${state}${out ? ` → ${out}` : ''}\n`;
}

