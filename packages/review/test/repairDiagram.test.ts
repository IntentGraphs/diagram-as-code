import { describe, it, expect } from 'vitest';
import { repairDiagram, registerProvider } from '../src/index.js';
import type { ReviewProvider, VisualFinding } from '../src/index.js';

const BROKEN = [
  'task "A" as a',
  'bogus "Review" as b',
  'a -> b',
].join('\n');

function finding(patch: { find: string; replace: string }): VisualFinding {
  return {
    severity: 'error',
    category: 'other',
    message: 'unknown keyword',
    source: 'model',
    patch,
  };
}

function scripted(id: string, repair: ReviewProvider['repair']): ReviewProvider {
  return {
    id,
    async review() { return []; },
    repair,
  };
}

describe('repairDiagram', () => {
  it('returns a structured unsupported result for a family without repair', async () => {
    const result = await repairDiagram(BROKEN, { family: 'mindmap' });
    expect(result).toEqual(expect.objectContaining({ status: 'unsupported', family: 'mindmap', operation: 'repair' }));
  });
  it('becomes valid before the attempt budget is exhausted', async () => {
    registerProvider(scripted('fix-once', async (bundle) => {
      if (!bundle.text.includes('bogus')) return [];
      return [finding({ find: 'bogus "Review" as b', replace: 'task "Review" as b' })];
    }));

    const result = await repairDiagram(BROKEN, { provider: 'fix-once', maxAttempts: 3 });
    expect(result.status).toBe('valid');
    expect(result.attempts).toBe(1);
    expect(result.attempts).toBeLessThan(3);
    expect(result.validation.valid).toBe(true);
    expect(result.text).toContain('task "Review" as b');
    expect(result.text).not.toContain('bogus');
  });

  it('reports budget_exhausted when patches never produce a valid diagram', async () => {
    registerProvider(scripted('never-fix', async () => []));

    const result = await repairDiagram(BROKEN, { provider: 'never-fix', maxAttempts: 3 });
    expect(result.status).toBe('budget_exhausted');
    expect(result.validation.valid).toBe(false);
    expect(result.text).toBe(BROKEN);
    expect(result.attempts).toBeGreaterThan(0);
  });

  it('stops after maxAttempts when each patch still leaves the file invalid', async () => {
    let calls = 0;
    registerProvider(scripted('unhelpful', async (bundle) => {
      calls += 1;
      return [finding({ find: bundle.text, replace: `${bundle.text}\n` })];
    }));

    const result = await repairDiagram(BROKEN, { provider: 'unhelpful', maxAttempts: 2 });
    expect(result.status).toBe('budget_exhausted');
    expect(result.attempts).toBe(2);
    expect(calls).toBe(2);
    expect(result.validation.valid).toBe(false);
  });
});
