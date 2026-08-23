import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, BPMN_LEGALITY_RULES } from '../src/index.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'legality');
const fixture = (name: string) => readFileSync(path.join(fixtureDir, name), 'utf8');

interface RuleFixturePair {
  ruleId: string;
  illegal: string;
  legal: string;
  illegalMessage: RegExp;
}

const RULE_FIXTURES: RuleFixturePair[] = [
  {
    ruleId: 'start-forbidden-triggers',
    illegal: 'illegal-start-terminate.bpm',
    legal: 'legal-end-terminate.bpm',
    illegalMessage: /Start event ".*" cannot use trigger "terminate"/,
  },
  {
    ruleId: 'start-forbidden-triggers',
    illegal: 'illegal-start-cancel.bpm',
    legal: 'legal-end-cancel.bpm',
    illegalMessage: /Start event ".*" cannot use trigger "cancel"/,
  },
  {
    ruleId: 'start-forbidden-triggers',
    illegal: 'illegal-start-compensation.bpm',
    legal: 'legal-boundary-compensation.bpm',
    illegalMessage: /Start event ".*" cannot use trigger "compensation"/,
  },
  {
    ruleId: 'start-forbidden-triggers',
    illegal: 'illegal-start-error.bpm',
    legal: 'legal-end-error.bpm',
    illegalMessage: /Start event ".*" cannot use trigger "error"/,
  },
  {
    ruleId: 'start-forbidden-triggers',
    illegal: 'illegal-start-escalation.bpm',
    legal: 'legal-intermediate-escalation.bpm',
    illegalMessage: /Start event ".*" cannot use trigger "escalation"/,
  },
  {
    ruleId: 'end-forbidden-triggers',
    illegal: 'illegal-end-timer.bpm',
    legal: 'legal-intermediate-timer.bpm',
    illegalMessage: /End event ".*" cannot use trigger "timer"/,
  },
  {
    ruleId: 'end-forbidden-triggers',
    illegal: 'illegal-end-conditional.bpm',
    legal: 'legal-start-conditional.bpm',
    illegalMessage: /End event ".*" cannot use trigger "conditional"/,
  },
  {
    ruleId: 'end-forbidden-triggers',
    illegal: 'illegal-end-link.bpm',
    legal: 'legal-intermediate-link.bpm',
    illegalMessage: /End event ".*" cannot use trigger "link"/,
  },
  {
    ruleId: 'intermediate-forbidden-triggers',
    illegal: 'illegal-intermediate-terminate.bpm',
    legal: 'legal-end-terminate.bpm',
    illegalMessage: /Intermediate event ".*" cannot use trigger "terminate"/,
  },
  {
    ruleId: 'intermediate-forbidden-triggers',
    illegal: 'illegal-intermediate-error.bpm',
    legal: 'legal-boundary-error.bpm',
    illegalMessage: /Intermediate event ".*" cannot use trigger "error"/,
  },
  {
    ruleId: 'intermediate-forbidden-triggers',
    illegal: 'illegal-intermediate-cancel.bpm',
    legal: 'legal-boundary-cancel-transaction.bpm',
    illegalMessage: /Intermediate event ".*" cannot use trigger "cancel"/,
  },
  {
    ruleId: 'boundary-forbidden-triggers',
    illegal: 'illegal-boundary-none.bpm',
    legal: 'legal-boundary-timer.bpm',
    illegalMessage: /Boundary event ".*" cannot use trigger "none"/,
  },
  {
    ruleId: 'boundary-forbidden-triggers',
    illegal: 'illegal-boundary-link.bpm',
    legal: 'legal-boundary-message.bpm',
    illegalMessage: /Boundary event ".*" cannot use trigger "link"/,
  },
  {
    ruleId: 'boundary-forbidden-triggers',
    illegal: 'illegal-boundary-terminate.bpm',
    legal: 'legal-end-terminate.bpm',
    illegalMessage: /Boundary event ".*" cannot use trigger "terminate"/,
  },
  {
    ruleId: 'boundary-cancel-transaction-host',
    illegal: 'illegal-boundary-cancel-task.bpm',
    legal: 'legal-boundary-cancel-transaction.bpm',
    illegalMessage: /Cancel boundary event ".*" must attach to a transaction activity/,
  },
  {
    ruleId: 'event-gateway-intermediate-targets',
    illegal: 'illegal-event-gateway-task-target.bpm',
    legal: 'legal-event-gateway-intermediate-target.bpm',
    illegalMessage: /Event-based gateway ".*" outgoing flow to ".*" .* is invalid/,
  },
];

describe('BPMN legality rule table', () => {
  it('declares every rule with a BPMN 2.0.2 spec citation', () => {
    expect(BPMN_LEGALITY_RULES.length).toBeGreaterThanOrEqual(6);
    for (const rule of BPMN_LEGALITY_RULES) {
      expect(rule.specRef).toMatch(/BPMN 2\.0\.2/);
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.summary.length).toBeGreaterThan(0);
    }
  });
});

describe('parse — BPMN structural legality', () => {
  for (const { ruleId, illegal, legal, illegalMessage } of RULE_FIXTURES) {
    it(`[${ruleId}] rejects ${illegal}`, () => {
      const { errors, semanticErrors } = parse(fixture(illegal));
      expect(errors).toEqual([]);
      expect(semanticErrors.length).toBeGreaterThan(0);
      expect(semanticErrors[0].message).toMatch(illegalMessage);
      expect(semanticErrors[0].line).toBeGreaterThan(0);
      expect(semanticErrors[0].column).toBe(1);
    });

    it(`[${ruleId}] accepts legal near-miss ${legal}`, () => {
      const { errors, semanticErrors } = parse(fixture(legal));
      expect(errors).toEqual([]);
      expect(semanticErrors).toEqual([]);
    });
  }

  it('reports line/column for an illegal start terminate via validate-shaped output', () => {
    const text = fixture('illegal-start-terminate.bpm');
    const { semanticErrors } = parse(text);
    expect(semanticErrors[0]).toEqual({
      line: 1,
      column: 1,
      message: 'Start event "s1" cannot use trigger "terminate" — BPMN 2.0 restricts terminate to end or boundary events (Table 10.84)',
    });
  });

  it('accepts receive tasks as event-based gateway targets', () => {
    const { errors, semanticErrors } = parse(fixture('legal-event-gateway-receive-task.bpm'));
    expect(errors).toEqual([]);
    expect(semanticErrors).toEqual([]);
  });
});
