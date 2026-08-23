import { describe, it, expect } from 'vitest';
import { reviewDiagram } from '../src/index.js';

describe('reviewDiagram', () => {
  it('returns geometry findings via the manual provider for a clean diagram', async () => {
    const text = [
      'task "A" as a',
      'task "B" as b',
      'a -> b',
    ].join('\n');
    const result = await reviewDiagram(text, { provider: 'manual' });
    expect(result.providerId).toBe('manual');
    expect(result.validation.valid).toBe(true);
    expect(result.visualFindings.every((f) => f.source === 'geometry' || f.source === 'model')).toBe(true);
  });

  it('returns a structured unsupported result for a family without visual review', async () => {
    const result = await reviewDiagram('root', { family: 'mindmap' });
    expect(result).toEqual(expect.objectContaining({ status: 'unsupported', family: 'mindmap', operation: 'visualReview' }));
  });
});
