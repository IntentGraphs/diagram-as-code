import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runImportDiagramCommand } from '../src/commands/importDiagram.js';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const cli = (argv: string[]) => parseArgv([...argv, '--json']);

describe('runImportDiagramCommand', () => {
  it('converts a clean BPMN XML export back to valid .bpm text', async () => {
    const result = await runImportDiagramCommand(cli(['import-diagram', fix('importable.bpmn')]));
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.conversion.status).toBe('valid');
    expect(json.validation.valid).toBe(true);
    expect(json.conversion.text).toContain('positioning: manual');
    expect(json.conversion.text).toContain('task "A" as a1');
    expect(json.conversion.text).toContain('task "B" as b1');
  });

  it('writes -o only on a valid conversion', async () => {
    const { readFileSync, existsSync, rmSync } = await import('node:fs');
    const outPath = '/tmp/bpm-import-diagram-test-output.bpm';
    if (existsSync(outPath)) rmSync(outPath);

    await runImportDiagramCommand(cli(['import-diagram', fix('importable.bpmn'), '-o', outPath]));
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, 'utf8')).toContain('task "A" as a1');
    rmSync(outPath);
  });

  it('reports a non-zero exit and does not write -o on unparseable input', async () => {
    const { existsSync, rmSync } = await import('node:fs');
    const outPath = '/tmp/bpm-import-diagram-test-should-not-exist.bpm';
    if (existsSync(outPath)) rmSync(outPath);

    const result = await runImportDiagramCommand(cli(['import-diagram', fix('bad-import.bpmn'), '-o', outPath]));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(existsSync(outPath)).toBe(false);
  });
});
