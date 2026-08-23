import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/args.js';
import { runGenerateCommand } from '../src/commands/generate.js';
import { registerProvider } from '@bpm/review';
import type { ReviewProvider } from '@bpm/review';

const cli = (argv: string[]) => parseArgv([...argv, '--json']);

describe('runGenerateCommand', () => {
  it('returns a clean unsupported diagnostic for a non-BPMN family', async () => {
    const result = await runGenerateCommand(cli(['generate', 'anything', '--family', 'mindmap']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'unsupported', family: 'mindmap', operation: 'generation' });
  });
  it('drafts a valid diagram with the manual (skeleton) provider', async () => {
    const result = await runGenerateCommand(
      cli(['generate', 'a customer submits an order and it ships', '--provider', 'manual']),
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.generation.status).toBe('valid');
    expect(json.validation.valid).toBe(true);
    expect(json.generation.text).toContain('event start none "Start" as e0');
  });

  it('supports opt-in manual positioning by freezing the generated layout', async () => {
    const result = await runGenerateCommand(
      cli(['generate', 'a customer submits an order and it ships', '--provider', 'manual', '--positioning', 'manual']),
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.positioning).toBe('manual');
    expect(json.generation.text).toContain('positioning: manual');
    expect(json.validation.valid).toBe(true);
  });

  it('writes -o only on success', async () => {
    const { readFileSync, existsSync, rmSync } = await import('node:fs');
    const outPath = '/tmp/bpm-generate-test-output.bpm';
    if (existsSync(outPath)) rmSync(outPath);

    await runGenerateCommand(
      cli(['generate', 'do a thing', '--provider', 'manual', '-o', outPath]),
    );
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, 'utf8')).toContain('event start none "Start" as e0');
    rmSync(outPath);
  });

  it('reports budget_exhausted and does not write -o when generation never becomes valid', async () => {
    const stubborn: ReviewProvider = {
      id: 'stubborn-generator-cli',
      async review() { return []; },
      async generate() { return 'not valid bpm syntax'; },
    };
    registerProvider(stubborn);

    const { existsSync, rmSync } = await import('node:fs');
    const outPath = '/tmp/bpm-generate-test-should-not-exist.bpm';
    if (existsSync(outPath)) rmSync(outPath);

    const result = await runGenerateCommand(
      cli(['generate', 'anything', '--provider', 'stubborn-generator-cli', '--max-attempts', '2', '-o', outPath]),
    );
    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.generation.status).toBe('budget_exhausted');
    expect(existsSync(outPath)).toBe(false);
  });

  it('rejects an empty description', async () => {
    const result = await runGenerateCommand(cli(['generate', '   ']));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/missing/);
  });
});
