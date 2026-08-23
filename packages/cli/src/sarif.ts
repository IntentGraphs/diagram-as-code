import path from 'node:path';
import type { CommandResult } from './commandResult.js';

interface DiagnosticLike {
  line?: number;
  column?: number;
  message?: string;
  code?: string;
  severity?: string;
}

export interface ValidationReport {
  file: string;
  payload: Record<string, unknown>;
}

function diagnostics(payload: Record<string, unknown>): Array<{ diagnostic: DiagnosticLike; kind: string }> {
  const groups: Array<[string, string]> = [
    ['errors', 'validation'],
    ['semanticErrors', 'semantic'],
    ['warnings', 'warning'],
  ];
  return groups.flatMap(([key, kind]) => {
    const entries = payload[key];
    return Array.isArray(entries)
      ? entries.map((diagnostic) => ({ diagnostic: diagnostic as DiagnosticLike, kind }))
      : [];
  });
}

function uriFor(file: string): string {
  if (file === '-') return 'stdin';
  const relative = path.relative(process.cwd(), path.resolve(file));
  return (relative || path.basename(file)).split(path.sep).join('/');
}

export function validationReportsToSarif(reports: ValidationReport[], version = '0.0.1'): Record<string, unknown> {
  const rules = new Map<string, { id: string; name: string }>();
  const results = reports.flatMap(({ file, payload }) => diagnostics(payload).map(({ diagnostic, kind }) => {
    const ruleId = diagnostic.code ?? `bpm.${kind}`;
    const name = diagnostic.message ?? ruleId;
    rules.set(ruleId, { id: ruleId, name });
    const level = diagnostic.severity === 'warning' || kind === 'warning' ? 'warning' : 'error';
    return {
      ruleId,
      level,
      message: { text: diagnostic.message ?? 'Diagram diagnostic' },
      locations: [{ physicalLocation: {
        artifactLocation: { uri: uriFor(file) },
        region: { startLine: Math.max(1, diagnostic.line ?? 1), startColumn: Math.max(1, diagnostic.column ?? 1) },
      } }],
      properties: { family: payload.effectiveFamily ?? 'bpmn', diagnosticKind: kind },
    };
  }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: {
        name: 'bpm', version,
        informationUri: 'https://github.com/IntentGraphs/diagram-as-code',
        rules: [...rules.values()].map((rule) => ({ id: rule.id, shortDescription: { text: rule.name } })),
      } },
      results,
    }],
  };
}

export function sarifResult(exitCode: number, reports: ValidationReport[]): CommandResult {
  return { exitCode, stdout: JSON.stringify(validationReportsToSarif(reports), null, 2) + '\n', stderr: '' };
}
