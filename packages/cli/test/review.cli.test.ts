import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runReviewCommand } from '../src/commands/review.js';
import { registerProvider } from '@bpm/review';
import type { ReviewProvider, VisualFinding } from '@bpm/review';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const cli = (argv: string[]) => parseArgv([...argv, '--json']);

function finding(patch: { find: string; replace: string }): VisualFinding {
  return {
    severity: 'error',
    category: 'other',
    message: 'unknown keyword',
    source: 'model',
    patch,
  };
}

const scripted: ReviewProvider = {
  id: 'scripted-repair',
  async review() { return []; },
  async repair(bundle) {
    if (!bundle.text.includes('bogus')) return [];
    return [finding({ find: 'bogus "Review" as b', replace: 'task "Review" as b' })];
  },
};

registerProvider(scripted);

describe('runReviewCommand repair', () => {
  it('repairs a known-broken fixture within the attempt budget', async () => {
    const result = await runReviewCommand(
      cli(['review', fix('repairable.bpm'), '--provider', 'scripted-repair']),
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.repair.status).toBe('valid');
    expect(json.repair.attempts).toBeLessThanOrEqual(3);
    expect(json.validation.valid).toBe(true);
    expect(json.repair.repairedText).toContain('task "Review" as b');
    expect(json.repair.repairedText).not.toContain('bogus');
  });

  it('does not rewrite the source file', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(fix('repairable.bpm'), 'utf8');
    await runReviewCommand(
      cli(['review', fix('repairable.bpm'), '--provider', 'scripted-repair']),
    );
    expect(readFileSync(fix('repairable.bpm'), 'utf8')).toBe(src);
  });

  it('keeps repair JSON on stdout when --image-out fails because the file is still invalid', async () => {
    const result = await runReviewCommand(
      cli(['review', fix('repairable.bpm'), '--provider', 'manual', '--image-out', '/tmp/bpm-review-should-not-write.png']),
    );
    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.repair.status).toBe('budget_exhausted');
    expect(json.validation.valid).toBe(false);
    expect(result.stderr).toBe('');
  });
});

describe('runReviewCommand valid diagrams', () => {
  it('rejects mindmap input with a structured unsupported-family error', async () => {
    const result = await runReviewCommand(cli(['review', fix('mindmap.bpm'), '--provider', 'manual']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'unsupported', family: 'mindmap', operation: 'visualReview' });
  });

  it('accepts an explicit "diagram: bpmn" directive (regression: must strip it before validating)', async () => {
    const result = await runReviewCommand(
      cli(['review', fix('clean-with-directive.bpm'), '--provider', 'manual']),
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.validation.valid).toBe(true);
  });

  it('does not include a repair field for a valid file', async () => {
    const result = await runReviewCommand(
      cli(['review', fix('clean.bpm'), '--provider', 'manual']),
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.repair).toBeUndefined();
    expect(json.validation.valid).toBe(true);
  });

  it('reports budget_exhausted for an invalid file with the manual provider', async () => {
    const result = await runReviewCommand(
      cli(['review', fix('repairable.bpm'), '--provider', 'manual']),
    );
    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.repair.status).toBe('budget_exhausted');
    expect(json.validation.valid).toBe(false);
  });
});
