import { describe, it, expect } from 'vitest';
import { generateDiagram, registerProvider } from '../src/index.js';
import type { ReviewProvider, VisualFinding } from '../src/index.js';

describe('generateDiagram', () => {
  it('returns a valid diagram straight from the manual (skeleton) provider', async () => {
    const result = await generateDiagram('Customer submits an order and it gets shipped', {
      provider: 'manual',
    });
    expect(result.status).toBe('valid');
    expect(result.attempts).toBe(0);
    expect(result.validation.valid).toBe(true);
    expect(result.text).toContain('event start none "Start" as e0');
    expect(result.text).toContain('event end none "End" as e1');
  });

  it('returns a structured unsupported result for a family without generation', async () => {
    const result = await generateDiagram('anything', { family: 'mindmap' });
    expect(result).toEqual(expect.objectContaining({ status: 'unsupported', family: 'mindmap', operation: 'generation' }));
  });

  it('can explicitly freeze a valid generated diagram into manual positioning', async () => {
    const result = await generateDiagram('Customer submits an order and it gets shipped', {
      provider: 'manual',
      positioning: 'manual',
    });
    expect(result.status).toBe('valid');
    expect(result.validation.valid).toBe(true);
    expect(result.text).toContain('positioning: manual');
    expect(result.text).toMatch(/at \(\d+, \d+\)/);
    expect(result.validation.inspection?.nodes.length).toBe(3);
  });

  it('can run the rendered visual-review loop when explicitly enabled', async () => {
    const visual: ReviewProvider = {
      id: 'visual-generator',
      async generate() {
        return [
          'event start none "Start" as e0',
          'task "Original" as t1',
          'event end none "End" as e1',
          '',
          'e0 -> t1',
          't1 -> e1',
        ].join('\n');
      },
      async repair() { return []; },
      async review() {
        return [{
          severity: 'warning',
          category: 'other',
          message: 'Use the requested label',
          source: 'model',
          patch: { find: 'task "Original" as t1', replace: 'task "Reviewed" as t1' },
        }];
      },
    };
    registerProvider(visual);

    const result = await generateDiagram('review this', {
      provider: visual.id,
      visualReview: true,
      maxVisualAttempts: 2,
    });
    expect(result.status).toBe('valid');
    expect(result.text).toContain('task "Reviewed" as t1');
    expect(result.findings.some((finding) => finding.source === 'model')).toBe(true);
  });

  it('falls back into the repair loop when a provider drafts something invalid', async () => {
    const flaky: ReviewProvider = {
      id: 'flaky-generator',
      async review() { return []; },
      async generate() {
        return ['event start none "Start" as e0', 'bogus "Do it" as t1', 'e0 -> t1'].join('\n');
      },
      async repair(bundle): Promise<VisualFinding[]> {
        if (!bundle.text.includes('bogus')) return [];
        return [{
          severity: 'error',
          category: 'other',
          message: 'unknown keyword',
          source: 'model',
          patch: { find: 'bogus "Do it" as t1', replace: 'task "Do it" as t1' },
        }];
      },
    };
    registerProvider(flaky);

    const result = await generateDiagram('do a thing', { provider: 'flaky-generator', maxAttempts: 3 });
    expect(result.status).toBe('valid');
    expect(result.attempts).toBe(1);
    expect(result.text).toContain('task "Do it" as t1');
    expect(result.text).not.toContain('bogus');
  });

  it('reports budget_exhausted when the draft never becomes valid', async () => {
    const stubborn: ReviewProvider = {
      id: 'stubborn-generator',
      async review() { return []; },
      async generate() { return 'this is not valid bpm syntax at all'; },
    };
    registerProvider(stubborn);

    const result = await generateDiagram('anything', { provider: 'stubborn-generator', maxAttempts: 2 });
    expect(result.status).toBe('budget_exhausted');
    expect(result.validation.valid).toBe(false);
  });

  it('throws for a provider without generate() support', async () => {
    const reviewOnly: ReviewProvider = {
      id: 'review-only',
      async review() { return []; },
    };
    registerProvider(reviewOnly);

    await expect(generateDiagram('anything', { provider: 'review-only' })).rejects.toThrow(/does not support generation/);
  });
});
