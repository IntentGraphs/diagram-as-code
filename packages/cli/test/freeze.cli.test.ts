import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runFreezeCommand } from '../src/commands/freeze.js';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const cli = (argv: string[]) => parseArgv([...argv, '--json']);

describe('runFreezeCommand', () => {
  it('freezes a valid auto-layout source and returns manual text', async () => {
    const result = await runFreezeCommand(cli(['freeze', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.conversion.status).toBe('valid');
    expect(body.conversion.text).toContain('positioning: manual');
    expect(body.validation.valid).toBe(true);
    expect(body.validation.inspection.nodes.length).toBe(2);
  });

  it('accepts an explicit "diagram: bpmn" directive (regression: must strip it before parsing)', async () => {
    const result = await runFreezeCommand(cli(['freeze', fix('clean-with-directive.bpm')]));
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.conversion.status).toBe('valid');
    expect(body.conversion.text).toContain('positioning: manual');
  });

  it('does not write output when the input is invalid', async () => {
    const { existsSync, rmSync } = await import('node:fs');
    const outPath = '/tmp/bpm-freeze-test-should-not-exist.bpm';
    if (existsSync(outPath)) rmSync(outPath);
    const result = await runFreezeCommand(cli(['freeze', fix('bad-syntax.bpm'), '-o', outPath]));
    expect(result.exitCode).toBe(1);
    expect(existsSync(outPath)).toBe(false);
  });

  it('rejects mindmap input with a structured unsupported-family error', async () => {
    const result = await runFreezeCommand(cli(['freeze', fix('mindmap.bpm')]));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ errors: [expect.objectContaining({ code: 'unsupported_family' })] });
  });
});
