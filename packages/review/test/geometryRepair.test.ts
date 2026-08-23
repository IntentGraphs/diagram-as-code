import { describe, expect, it } from 'vitest';
import { repairGeometry } from '../src/index.js';

describe('repairGeometry', () => {
  it('consumes an actionable manual overlap hint and preserves valid DSL', async () => {
    const result = await repairGeometry([
      'positioning: manual',
      '',
      'gateway exclusive "A" as a at (0, 0)',
      'gateway exclusive "B" as b at (10, 10)',
    ].join('\n'));

    expect(result.status).toBe('valid');
    expect(result.clean).toBe(true);
    expect(result.attempts).toBeGreaterThan(0);
    expect(result.actions[0]).toMatch(/shifted "b"/);
    expect(result.validation.metrics?.nodeOverlaps).toBe(0);
  });
});
