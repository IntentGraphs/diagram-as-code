import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SURVEY_PATH = join(import.meta.dirname, '../../../docs/superpowers/specs/2026-08-14-bpmn-feature-gap-survey.md');

describe('BPMN feature-gap survey artifact', () => {
  it('exists with prioritized gap IDs G1–G13', () => {
    const text = readFileSync(SURVEY_PATH, 'utf8');
    expect(text).toContain('# BPMN 2.0 Feature Gap Survey');
    expect(text).toContain('## Prioritized gaps');
    for (let i = 1; i <= 13; i++) {
      expect(text).toContain(`G${i}`);
    }
  });

  it('documents impact on downstream roadmap items', () => {
    const text = readFileSync(SURVEY_PATH, 'utf8');
    expect(text).toContain('Impact on downstream items');
    expect(text).toContain('Legality validation');
    expect(text).toContain('Camunda extensions');
  });
});
