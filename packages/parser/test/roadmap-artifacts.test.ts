import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = join(import.meta.dirname, '../../../docs/superpowers');

const DESIGN_ARTIFACTS = [
  'specs/2026-08-14-bpmn-feature-gap-survey.md',
  'specs/2026-08-14-bpmn-legality-validation-design.md',
  'specs/2026-08-14-ai-dsl-repair-design.md',
  'specs/2026-08-14-project-saving-design.md',
  'specs/2026-08-14-camunda-extensions-design.md',
  'specs/2026-08-14-layout-routing-hardening-design.md',
  'plans/2026-08-14-project-saving.md',
  'plans/2026-08-14-camunda-extensions.md',
  'plans/2026-08-14-ai-dsl-repair.md',
];

describe('roadmap work-package design artifacts', () => {
  for (const rel of DESIGN_ARTIFACTS) {
    it(`includes ${rel}`, () => {
      const path = join(DOCS, rel.replace('specs/', 'specs/').replace('plans/', 'plans/'));
      expect(existsSync(path), `missing ${rel}`).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text.length).toBeGreaterThan(200);
    });
  }
});
