import { describe, expect, it } from 'vitest';
import { evaluateDiagramSet } from '../src/index.js';

describe('evaluateDiagramSet', () => {
  it('runs repeatable geometry gates and reports failures by case', async () => {
    const result = await evaluateDiagramSet([
      {
        id: 'clean-flow',
        text: ['task "A" as a', 'task "B" as b', 'a -> b'].join('\n'),
        maxEdgeCrossings: 0,
        maxNodeOverlaps: 0,
        maxEdgeThroughNode: 0,
        maxRouteFallbacks: 0,
      },
      {
        id: 'valid-but-crossing-budget',
        text: ['task "A" as a', 'task "B" as b', 'a -> b'].join('\n'),
        maxEdgeCrossings: -1,
      },
    ]);

    expect(result.total).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1].failures[0]).toMatch(/edgeCrossings/);
  });
});
